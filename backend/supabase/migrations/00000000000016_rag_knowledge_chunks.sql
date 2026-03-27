-- ============================================================
-- Migration 016: RAG Knowledge Chunks + pgvector
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge chunks table for RAG retrieval
CREATE TABLE rag_knowledge_chunks (
  chunk_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  athlete_summary TEXT NOT NULL,
  coach_summary   TEXT NOT NULL,
  rec_types       TEXT[],
  phv_stages      TEXT[],
  age_groups      TEXT[],
  sports          TEXT[] DEFAULT '{all}',
  contexts        TEXT[] DEFAULT '{}',
  embedding       vector(512),
  primary_source  TEXT,
  evidence_grade  TEXT,
  last_reviewed   DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX idx_rag_embedding ON rag_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Metadata filter indexes for pre-filtering before vector search
CREATE INDEX idx_rag_rec_types  ON rag_knowledge_chunks USING GIN (rec_types);
CREATE INDEX idx_rag_phv_stages ON rag_knowledge_chunks USING GIN (phv_stages);
CREATE INDEX idx_rag_domains    ON rag_knowledge_chunks (domain);

-- RLS: service role only (backend reads/writes via admin client)
ALTER TABLE rag_knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Vector similarity search with metadata pre-filters
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(512),
  filter_rec_types text[],
  filter_phv_stages text[],
  filter_age_groups text[],
  match_count int DEFAULT 3,
  match_threshold float DEFAULT 0.70
)
RETURNS TABLE (
  chunk_id uuid, domain text, title text, content text,
  athlete_summary text, coach_summary text,
  primary_source text, evidence_grade text, similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    chunk_id, domain, title, content, athlete_summary, coach_summary,
    primary_source, evidence_grade,
    1 - (embedding <=> query_embedding) AS similarity
  FROM rag_knowledge_chunks
  WHERE
    rec_types && filter_rec_types
    AND phv_stages && filter_phv_stages
    AND age_groups && filter_age_groups
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Add audit column to existing recommendations table
ALTER TABLE athlete_recommendations
  ADD COLUMN IF NOT EXISTS retrieved_chunk_ids UUID[] DEFAULT '{}';
