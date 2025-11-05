-- Fix Failed Migration in Production
-- This resolves the failed migration and ensures pgvector extension exists

-- Step 1: Install pgvector extension (required for vector embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Check if migration table exists and has failed migrations
SELECT migration_name, finished_at, logs
FROM _prisma_migrations
WHERE migration_name = '20251031000000_batch_processing_architecture'
  AND finished_at IS NULL;

-- Step 3: Mark the failed migration as rolled back so it can be removed
-- (Prisma won't let us retry a failed migration, we need to remove it)
DELETE FROM _prisma_migrations
WHERE migration_name = '20251031000000_batch_processing_architecture'
  AND finished_at IS NULL;

-- Step 4: Verify _prisma_migrations is clean
SELECT migration_name, finished_at, started_at
FROM _prisma_migrations
ORDER BY started_at DESC;

-- Now when the app restarts, Prisma will run all migrations from scratch on the clean database
