-- Reset Production Database for Fresh Prisma Migrations
-- WARNING: This will DELETE ALL DATA in the database!
-- Only run this if you want to start completely fresh

-- Drop all tables in dependency order (reverse of creation order)

-- Phase 1: Drop new multi-stream tables
DROP TABLE IF EXISTS "doc_proposals" CASCADE;
DROP TABLE IF EXISTS "conversation_rag_context" CASCADE;
DROP TABLE IF EXISTS "message_classification" CASCADE;
DROP TABLE IF EXISTS "unified_messages" CASCADE;
DROP TABLE IF EXISTS "processing_watermark" CASCADE;
DROP TABLE IF EXISTS "import_watermarks" CASCADE;
DROP TABLE IF EXISTS "stream_configs" CASCADE;

-- Phase 2: Drop documentation index cache tables
DROP TABLE IF EXISTS "doc_index_cache" CASCADE;
DROP TABLE IF EXISTS "git_sync_state" CASCADE;
DROP TABLE IF EXISTS "document_pages" CASCADE;

-- Phase 3: Drop version history tables
DROP TABLE IF EXISTS "section_versions" CASCADE;

-- Phase 4: Drop legacy scraping tables
DROP TABLE IF EXISTS "scrape_metadata" CASCADE;
DROP TABLE IF EXISTS "scraped_messages" CASCADE;

-- Phase 5: Drop update tracking tables
DROP TABLE IF EXISTS "update_history" CASCADE;
DROP TABLE IF EXISTS "pending_updates" CASCADE;

-- Phase 6: Drop documentation tables
DROP TABLE IF EXISTS "documentation_sections" CASCADE;

-- Phase 7: Drop Prisma migrations table
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- Phase 8: Drop any remaining sequences
DROP SEQUENCE IF EXISTS documentation_sections_id_seq CASCADE;
DROP SEQUENCE IF EXISTS pending_updates_id_seq CASCADE;
DROP SEQUENCE IF EXISTS update_history_id_seq CASCADE;
DROP SEQUENCE IF EXISTS scraped_messages_id_seq CASCADE;
DROP SEQUENCE IF EXISTS scrape_metadata_id_seq CASCADE;
DROP SEQUENCE IF EXISTS section_versions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS document_pages_id_seq CASCADE;
DROP SEQUENCE IF EXISTS git_sync_state_id_seq CASCADE;
DROP SEQUENCE IF EXISTS doc_index_cache_id_seq CASCADE;
DROP SEQUENCE IF EXISTS stream_configs_id_seq CASCADE;
DROP SEQUENCE IF EXISTS import_watermarks_id_seq CASCADE;
DROP SEQUENCE IF EXISTS processing_watermark_id_seq CASCADE;
DROP SEQUENCE IF EXISTS unified_messages_id_seq CASCADE;
DROP SEQUENCE IF EXISTS message_classification_id_seq CASCADE;
DROP SEQUENCE IF EXISTS conversation_rag_context_id_seq CASCADE;
DROP SEQUENCE IF EXISTS doc_proposals_id_seq CASCADE;

-- Phase 9: Drop enum types
DROP TYPE IF EXISTS "SectionType" CASCADE;
DROP TYPE IF EXISTS "UpdateType" CASCADE;
DROP TYPE IF EXISTS "UpdateStatus" CASCADE;
DROP TYPE IF EXISTS "ActionType" CASCADE;
DROP TYPE IF EXISTS "MessageSource" CASCADE;
DROP TYPE IF EXISTS "VersionOp" CASCADE;
DROP TYPE IF EXISTS "ProcessingStatus" CASCADE;
DROP TYPE IF EXISTS "ProposalStatus" CASCADE;

-- Phase 10: Ensure pgvector extension exists
-- Create the vector extension if it doesn't exist (needed for RAG embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify cleanup
SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Should return empty set (no tables except _prisma_migrations if migrations ran)
