-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop the existing embedding column (if exists) and recreate it as vector type
ALTER TABLE document_pages
DROP COLUMN IF EXISTS embedding;

ALTER TABLE document_pages
ADD COLUMN embedding vector(768);

-- Create HNSW index for fast cosine similarity search on embeddings
CREATE INDEX IF NOT EXISTS document_pages_embedding_idx
ON document_pages
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add index for fast file path lookups (for updates/deletes)
CREATE INDEX IF NOT EXISTS document_pages_file_path_idx
ON document_pages(file_path);

-- Add index on git_sync_state for faster lookups
CREATE INDEX IF NOT EXISTS git_sync_state_git_url_idx
ON git_sync_state(git_url);