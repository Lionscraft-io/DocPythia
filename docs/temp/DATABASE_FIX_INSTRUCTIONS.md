# Database Schema Fix Instructions

## Problem
The database tables were created with an outdated schema that's missing critical columns like `section_id`, `level`, `order_index` in the `documentation_sections` table. This causes errors when the application tries to query these columns.

## Root Cause
The manual table creation SQL in `server/migrate.ts` was out of sync with the actual schema defined in `server/schema.ts`.

## What Was Fixed
1. Updated `server/migrate.ts` to include complete table definitions matching `server/schema.ts`
2. Fixed `drizzle.config.ts` to point to correct schema path (`./server/schema.ts`)
3. Added all missing columns and proper enum types
4. Created database reset script

## How to Fix the Production Database

### Option 1: Reset Database (Recommended - No Data to Preserve)
Since this is a new deployment with no production data, the cleanest approach is to reset:

1. Connect to your Neon database using psql or the Neon SQL Editor
2. Run the reset script:
   ```bash
   psql $DATABASE_URL -f scripts/permanent/reset-database.sql
   ```
   Or copy the contents of `scripts/permanent/reset-database.sql` into Neon SQL Editor

3. Redeploy your App Runner service or restart it to trigger table recreation with the correct schema

### Option 2: Manual Column Addition (If Data Exists)
If you have data you need to preserve:

```sql
-- Add missing columns to documentation_sections
ALTER TABLE documentation_sections
  ADD COLUMN IF NOT EXISTS section_id TEXT,
  ADD COLUMN IF NOT EXISTS level INTEGER,
  ADD COLUMN IF NOT EXISTS order_index INTEGER;

-- Set section_id to id value for existing records
UPDATE documentation_sections SET section_id = id WHERE section_id IS NULL;

-- Set default values for other new columns
UPDATE documentation_sections SET order_index = 0 WHERE order_index IS NULL;

-- Make section_id unique and not null
ALTER TABLE documentation_sections
  ALTER COLUMN section_id SET NOT NULL,
  ADD CONSTRAINT documentation_sections_section_id_unique UNIQUE (section_id);
```

## Verification
After fixing, test by accessing:
- `GET /api/docs` - Should return documentation sections without errors
- Check App Runner logs for successful table creation

## Prevention
- Always use `npm run db:push` to sync schema changes
- Keep `server/migrate.ts` manual SQL in sync with `server/schema.ts`
- Consider generating migrations with `drizzle-kit generate` for version control
