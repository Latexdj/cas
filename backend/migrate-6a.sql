-- Phase 6a: pgvector + policy_chunks table
-- Run in Supabase SQL Editor (Database → SQL Editor) before deploying.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS policy_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  chunk_index  INT         NOT NULL,
  section_hint TEXT,
  chunk_text   TEXT        NOT NULL,
  token_count  INT         NOT NULL DEFAULT 0,
  embedding    vector(1024),
  is_active    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS policy_chunks_document_idx
  ON policy_chunks (document_id);

CREATE INDEX IF NOT EXISTS policy_chunks_active_idx
  ON policy_chunks (document_id, is_active)
  WHERE is_active = true;

-- HNSW index for cosine similarity search (pgvector >= 0.5.0, available on Supabase).
-- If this fails, the table still works via sequential scan for small corpora (<5000 chunks).
CREATE INDEX IF NOT EXISTS policy_chunks_embedding_idx
  ON policy_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
