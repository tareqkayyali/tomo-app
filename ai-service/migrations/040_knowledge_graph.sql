-- ============================================================================
-- Migration 040: Knowledge Graph — PropertyGraphIndex Tables
-- ============================================================================
-- Phase 5 of the Tomo enterprise migration.
--
-- Creates a property graph on top of the existing rag_knowledge_chunks table.
-- 7 entity types × 10 relation types for multi-hop graph traversal.
--
-- Entity types: concept, exercise, protocol, condition, sport, age_band, body_region
-- Relation types: CONTRAINDICATED_FOR, SAFE_ALTERNATIVE_TO, PREREQUISITE_FOR,
--   RECOMMENDED_FOR, BELONGS_TO, APPLICABLE_TO, AFFECTS, EVIDENCE_SUPPORTS,
--   PART_OF, TRIGGERS
-- ============================================================================

-- Ensure pgvector extension exists (should already be from migration 016)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Entity Table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_entities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type      TEXT NOT NULL,          -- concept | exercise | protocol | condition | sport | age_band | body_region
    name             TEXT NOT NULL,          -- Machine-readable slug: "mid_phv", "barbell_squat"
    display_name     TEXT NOT NULL,          -- Human-readable: "Mid-PHV (Peak Height Velocity)", "Barbell Squat"
    description      TEXT NOT NULL DEFAULT '',
    properties       JSONB NOT NULL DEFAULT '{}',  -- Flexible metadata (evidence_grade, sports[], phv_stages[], etc.)
    embedding        vector(512),            -- Voyage AI voyage-3-lite embedding of description
    source_chunk_ids UUID[] DEFAULT '{}',    -- Back-references to rag_knowledge_chunks.chunk_id
    search_vector    tsvector,               -- Full-text search on name + description
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique constraint: one entity per type+name
    CONSTRAINT uq_entity_type_name UNIQUE (entity_type, name)
);

-- ── Relationship Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id  UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    target_entity_id  UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    relation_type     TEXT NOT NULL,          -- CONTRAINDICATED_FOR, SAFE_ALTERNATIVE_TO, etc.
    properties        JSONB NOT NULL DEFAULT '{}',  -- evidence_grade, confidence, notes, sports[], etc.
    source_chunk_ids  UUID[] DEFAULT '{}',    -- Which knowledge chunks sourced this relationship
    weight            FLOAT NOT NULL DEFAULT 1.0,   -- Relationship strength (for ranked traversal)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate relationships
    CONSTRAINT uq_relationship UNIQUE (source_entity_id, target_entity_id, relation_type)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Vector similarity search on entity embeddings (HNSW)
CREATE INDEX IF NOT EXISTS idx_ke_embedding
    ON knowledge_entities USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_ke_search_vector
    ON knowledge_entities USING GIN (search_vector);

-- Filter by entity type
CREATE INDEX IF NOT EXISTS idx_ke_entity_type
    ON knowledge_entities (entity_type);

-- Filter by name (for exact lookups)
CREATE INDEX IF NOT EXISTS idx_ke_name
    ON knowledge_entities (name);

-- Relationship traversal: source → targets
CREATE INDEX IF NOT EXISTS idx_kr_source
    ON knowledge_relationships (source_entity_id);

-- Relationship traversal: target → sources (reverse)
CREATE INDEX IF NOT EXISTS idx_kr_target
    ON knowledge_relationships (target_entity_id);

-- Filter by relation type
CREATE INDEX IF NOT EXISTS idx_kr_relation_type
    ON knowledge_relationships (relation_type);

-- Composite: relation type + source (common query pattern)
CREATE INDEX IF NOT EXISTS idx_kr_type_source
    ON knowledge_relationships (relation_type, source_entity_id);

-- Properties JSONB (for metadata filtering)
CREATE INDEX IF NOT EXISTS idx_ke_properties
    ON knowledge_entities USING GIN (properties);

-- ── Auto-update search_vector trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_entity_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        coalesce(NEW.name, '') || ' ' ||
        coalesce(NEW.display_name, '') || ' ' ||
        coalesce(NEW.description, '')
    );
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entity_search_vector ON knowledge_entities;
CREATE TRIGGER trg_entity_search_vector
    BEFORE INSERT OR UPDATE ON knowledge_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_entity_search_vector();

-- ── RPC: Vector search entities ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_knowledge_entities(
    query_embedding   vector(512),
    filter_types      text[] DEFAULT NULL,
    match_count       int DEFAULT 10,
    match_threshold   float DEFAULT 0.60
)
RETURNS TABLE (
    id            uuid,
    entity_type   text,
    name          text,
    display_name  text,
    description   text,
    properties    jsonb,
    similarity    float
)
LANGUAGE sql STABLE AS $$
    SELECT
        e.id, e.entity_type, e.name, e.display_name, e.description, e.properties,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM knowledge_entities e
    WHERE
        (filter_types IS NULL OR e.entity_type = ANY(filter_types))
        AND e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ── RPC: Graph traversal (1-hop) ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION traverse_knowledge_graph(
    start_entity_id   uuid,
    relation_types    text[] DEFAULT NULL,
    direction         text DEFAULT 'outgoing',   -- 'outgoing' | 'incoming' | 'both'
    max_results       int DEFAULT 20
)
RETURNS TABLE (
    relationship_id   uuid,
    relation_type     text,
    related_entity_id uuid,
    related_type      text,
    related_name      text,
    related_display   text,
    related_desc      text,
    rel_properties    jsonb,
    rel_weight        float
)
LANGUAGE sql STABLE AS $$
    -- Outgoing: start_entity → related_entity
    SELECT
        r.id AS relationship_id,
        r.relation_type,
        e.id AS related_entity_id,
        e.entity_type AS related_type,
        e.name AS related_name,
        e.display_name AS related_display,
        e.description AS related_desc,
        r.properties AS rel_properties,
        r.weight AS rel_weight
    FROM knowledge_relationships r
    JOIN knowledge_entities e ON e.id = r.target_entity_id
    WHERE
        r.source_entity_id = start_entity_id
        AND (direction IN ('outgoing', 'both'))
        AND (relation_types IS NULL OR r.relation_type = ANY(relation_types))

    UNION ALL

    -- Incoming: related_entity → start_entity
    SELECT
        r.id AS relationship_id,
        r.relation_type,
        e.id AS related_entity_id,
        e.entity_type AS related_type,
        e.name AS related_name,
        e.display_name AS related_display,
        e.description AS related_desc,
        r.properties AS rel_properties,
        r.weight AS rel_weight
    FROM knowledge_relationships r
    JOIN knowledge_entities e ON e.id = r.source_entity_id
    WHERE
        r.target_entity_id = start_entity_id
        AND (direction IN ('incoming', 'both'))
        AND (relation_types IS NULL OR r.relation_type = ANY(relation_types))

    ORDER BY rel_weight DESC
    LIMIT max_results;
$$;

-- ── RPC: 2-hop traversal (for multi-hop queries) ────────────────────────────

CREATE OR REPLACE FUNCTION traverse_knowledge_graph_2hop(
    start_entity_id   uuid,
    hop1_relations    text[] DEFAULT NULL,
    hop2_relations    text[] DEFAULT NULL,
    max_results       int DEFAULT 20
)
RETURNS TABLE (
    hop1_relation     text,
    hop1_entity_id    uuid,
    hop1_entity_name  text,
    hop1_entity_type  text,
    hop2_relation     text,
    hop2_entity_id    uuid,
    hop2_entity_name  text,
    hop2_entity_type  text,
    hop2_description  text,
    total_weight      float
)
LANGUAGE sql STABLE AS $$
    SELECT
        r1.relation_type AS hop1_relation,
        e1.id AS hop1_entity_id,
        e1.display_name AS hop1_entity_name,
        e1.entity_type AS hop1_entity_type,
        r2.relation_type AS hop2_relation,
        e2.id AS hop2_entity_id,
        e2.display_name AS hop2_entity_name,
        e2.entity_type AS hop2_entity_type,
        e2.description AS hop2_description,
        (r1.weight + r2.weight) AS total_weight
    FROM knowledge_relationships r1
    JOIN knowledge_entities e1 ON e1.id = r1.target_entity_id
    JOIN knowledge_relationships r2 ON r2.source_entity_id = e1.id
    JOIN knowledge_entities e2 ON e2.id = r2.target_entity_id
    WHERE
        r1.source_entity_id = start_entity_id
        AND (hop1_relations IS NULL OR r1.relation_type = ANY(hop1_relations))
        AND (hop2_relations IS NULL OR r2.relation_type = ANY(hop2_relations))
    ORDER BY (r1.weight + r2.weight) DESC
    LIMIT max_results;
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;

-- Service role can manage all (backend reads/writes)
CREATE POLICY "service_role_entities"
    ON knowledge_entities FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "service_role_relationships"
    ON knowledge_relationships FOR ALL
    USING (auth.role() = 'service_role');

-- Authenticated users can read (for CMS admin views)
CREATE POLICY "authenticated_read_entities"
    ON knowledge_entities FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_relationships"
    ON knowledge_relationships FOR SELECT
    USING (auth.role() = 'authenticated');
