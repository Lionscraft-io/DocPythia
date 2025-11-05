-- Reset database script
-- This drops all existing tables and types to allow clean recreation
-- WARNING: This will delete all data!

-- Drop tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS "section_versions" CASCADE;
DROP TABLE IF EXISTS "update_history" CASCADE;
DROP TABLE IF EXISTS "pending_updates" CASCADE;
DROP TABLE IF EXISTS "scraped_messages" CASCADE;
DROP TABLE IF EXISTS "scrape_metadata" CASCADE;
DROP TABLE IF EXISTS "documentation_sections" CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS version_op CASCADE;
DROP TYPE IF EXISTS message_source CASCADE;
DROP TYPE IF EXISTS action_type CASCADE;
DROP TYPE IF EXISTS update_status CASCADE;
DROP TYPE IF EXISTS update_type CASCADE;
DROP TYPE IF EXISTS section_type CASCADE;

-- Tables will be recreated automatically by the app on next startup
