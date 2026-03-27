-- Resize embedding column for Voyage AI voyage-3-lite (512-dim vs 1536-dim OpenAI)
-- This is safe because the table is currently empty (no data to migrate)
ALTER TABLE rag_knowledge_chunks ALTER COLUMN embedding TYPE vector(512);

-- Re-create HNSW index for new dimensions
DROP INDEX IF EXISTS idx_rag_embedding;
CREATE INDEX idx_rag_embedding ON rag_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
