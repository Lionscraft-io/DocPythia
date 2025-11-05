-- Complete Database Reset for Production
-- This script does EVERYTHING needed for a fresh start:
-- 1. Drops all existing tables
-- 2. Installs pgvector extension
-- 3. Ready for Prisma migrations to run from scratch

-- WARNING: THIS WILL DELETE ALL DATA!

-- ========== DROP ALL TABLES ==========

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS "doc_proposals" CASCADE;
DROP TABLE IF EXISTS "conversation_rag_context" CASCADE;
DROP TABLE IF EXISTS "message_classification" CASCADE;
DROP TABLE IF EXISTS "unified_messages" CASCADE;
DROP TABLE IF EXISTS "processing_watermark" CASCADE;
DROP TABLE IF EXISTS "import_watermarks" CASCADE;
DROP TABLE IF EXISTS "stream_configs" CASCADE;
DROP TABLE IF EXISTS "doc_index_cache" CASCADE;
DROP TABLE IF EXISTS "git_sync_state" CASCADE;
DROP TABLE IF EXISTS "document_pages" CASCADE;
DROP TABLE IF EXISTS "section_versions" CASCADE;
DROP TABLE IF EXISTS "scrape_metadata" CASCADE;
DROP TABLE IF EXISTS "scraped_messages" CASCADE;
DROP TABLE IF EXISTS "update_history" CASCADE;
DROP TABLE IF EXISTS "pending_updates" CASCADE;
DROP TABLE IF EXISTS "documentation_sections" CASCADE;

-- Drop any materialized views
DROP MATERIALIZED VIEW IF EXISTS "admin_message_analysis" CASCADE;
DROP MATERIALIZED VIEW IF EXISTS "admin_view" CASCADE;

-- Drop Prisma migrations table (to start fresh)
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- ========== DROP ENUM TYPES ==========

DROP TYPE IF EXISTS "SectionType" CASCADE;
DROP TYPE IF EXISTS "UpdateType" CASCADE;
DROP TYPE IF EXISTS "UpdateStatus" CASCADE;
DROP TYPE IF EXISTS "ActionType" CASCADE;
DROP TYPE IF EXISTS "MessageSource" CASCADE;
DROP TYPE IF EXISTS "VersionOp" CASCADE;
DROP TYPE IF EXISTS "ProcessingStatus" CASCADE;
DROP TYPE IF EXISTS "ProposalStatus" CASCADE;

-- ========== INSTALL PGVECTOR EXTENSION ==========

-- Required for vector embeddings (RAG functionality)
CREATE EXTENSION IF NOT EXISTS vector;

-- ========== VERIFICATION ==========

-- Verify database is empty (should return 0 or only system tables)
SELECT COUNT(*) as table_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%';

-- Verify pgvector extension is installed
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';

-- Database is now ready for fresh Prisma migrations!
-- Redeploy your application and migrations will run automatically.
