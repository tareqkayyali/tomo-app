-- Migration 043: Add BM25-style text search to rag_knowledge_chunks + tenant scoping on graph tables
--
-- Phase 5A: PropertyGraphIndex enhancements
--   1. tsvector + GIN index on rag_knowledge_chunks for hybrid (vector + text) retrieval
--   2. institution_id on knowledge_entities and knowledge_relationships for multi-tenant scoping
--   3. Updated match_knowledge_entities RPC to accept institution filter

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Text search on rag_knowledge_chunks
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add tsvector column for full-text search
ALTER TABLE rag_knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate from title + content + athlete_summary
UPDATE rag_knowledge_chunks
SET search_vector = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(content, '') || ' ' ||
  coalesce(athlete_summary, '')
);

-- GIN index for fast text search
CREATE INDEX IF NOT EXISTS idx_rag_chunks_search_vector
  ON rag_knowledge_chunks USING gin(search_vector);

-- Auto-update trigger on insert/update
CREATE OR REPLACE FUNCTION rag_chunks_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.content, '') || ' ' ||
    coalesce(NEW.athlete_summary, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rag_chunks_search_vector ON rag_knowledge_chunks;
CREATE TRIGGER trg_rag_chunks_search_vector
  BEFORE INSERT OR UPDATE OF title, content, athlete_summary
  ON rag_knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION rag_chunks_search_vector_trigger();

-- RPC for text search on chunks (BM25-approximation via ts_rank_cd)
CREATE OR REPLACE FUNCTION match_knowledge_chunks_text(
  query_text text,
  filter_rec_types text[] DEFAULT NULL,
  filter_phv_stages text[] DEFAULT NULL,
  filter_age_groups text[] DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  chunk_id uuid,
  domain text,
  title text,
  content text,
  athlete_summary text,
  evidence_grade text,
  rank float
)
LANGUAGE plpgsql
AS $$
DECLARE
  tsq tsquery;
BEGIN
  -- Build tsquery: split words, OR-join for broad matching
  tsq := plainto_tsquery('english', query_text);

  RETURN QUERY
  SELECT
    rkc.chunk_id,
    rkc.domain,
    rkc.title,
    rkc.content,
    rkc.athlete_summary,
    rkc.evidence_grade,
    ts_rank_cd(rkc.search_vector, tsq, 32)::float AS rank
  FROM rag_knowledge_chunks rkc
  WHERE rkc.search_vector @@ tsq
    AND (filter_rec_types IS NULL OR rkc.rec_types && filter_rec_types)
    AND (filter_phv_stages IS NULL OR rkc.phv_stages && filter_phv_stages)
    AND (filter_age_groups IS NULL OR rkc.age_groups && filter_age_groups)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Multi-tenant scoping on graph tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- institution_id on knowledge_entities
ALTER TABLE knowledge_entities
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES cms_tenants(id);

CREATE INDEX IF NOT EXISTS idx_ke_institution
  ON knowledge_entities(institution_id) WHERE institution_id IS NOT NULL;

-- institution_id on knowledge_relationships
ALTER TABLE knowledge_relationships
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES cms_tenants(id);

CREATE INDEX IF NOT EXISTS idx_kr_institution
  ON knowledge_relationships(institution_id) WHERE institution_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Updated match_knowledge_entities RPC with optional institution filter
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_knowledge_entities(
  query_embedding vector(512),
  filter_entity_types text[] DEFAULT NULL,
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.60,
  filter_institution_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  entity_type text,
  name text,
  display_name text,
  description text,
  properties jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.entity_type,
    ke.name,
    ke.display_name,
    ke.description,
    ke.properties,
    (1 - (ke.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_entities ke
  WHERE (1 - (ke.embedding <=> query_embedding)) >= match_threshold
    AND (filter_entity_types IS NULL OR ke.entity_type = ANY(filter_entity_types))
    AND (filter_institution_ids IS NULL OR ke.institution_id IS NULL OR ke.institution_id = ANY(filter_institution_ids))
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
