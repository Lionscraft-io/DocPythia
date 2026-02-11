-- SQL script to fix production database after flattening migrations
-- Run this ONCE on your production database BEFORE deploying the new code
--
-- This script:
-- 1. Clears the old migration history
-- 2. Inserts the new baseline migration as "already applied"
--
-- WARNING: Only run this on databases that already have the full schema applied!

BEGIN;

-- Clear old migration records
DELETE FROM "_prisma_migrations";

-- Insert the baseline migration as already applied
INSERT INTO "_prisma_migrations" (
    id,
    checksum,
    finished_at,
    migration_name,
    logs,
    rolled_back_at,
    started_at,
    applied_steps_count
) VALUES (
    gen_random_uuid()::text,
    '8671d55e6b99bcc312aaf036d88caaa8c31565208286b89abaa42f2f8892f5dc',
    NOW(),
    '0_baseline',
    NULL,
    NULL,
    NOW(),
    1
);

COMMIT;

-- Verify the fix
SELECT * FROM "_prisma_migrations";
