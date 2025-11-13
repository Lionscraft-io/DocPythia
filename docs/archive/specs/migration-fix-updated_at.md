# Migration Fix: ImportWatermark updated_at Column

**Issue:** Database migration failed with error about missing default value for `updated_at` column
**Date:** 2025-10-31
**Status:** ✅ Fixed

## Error

```
⚠️ We found changes that cannot be executed:

• Added the required column `updated_at` to the `import_watermarks` table without a default value.
  There are 1 rows in this table, it is not possible to execute this step.
```

## Root Cause

The Prisma schema expected columns that didn't exist or had different names in the database:

1. **Schema expected:** `updated_at`
   **Database had:** `last_updated_at`

2. **Schema expected:** `created_at`
   **Database had:** Nothing (column didn't exist)

3. **Database had:** `total_processed` (no longer needed)

## Solution

Updated the migration script to properly handle column renames and additions:

### Changes to Migration SQL

```sql
-- Before (missing steps):
ALTER TABLE "import_watermarks" ADD COLUMN "stream_type" VARCHAR(50);
ALTER TABLE "import_watermarks" ADD COLUMN "resource_id" VARCHAR(255);
ALTER TABLE "import_watermarks" ADD COLUMN "import_complete" BOOLEAN DEFAULT FALSE;

-- After (complete steps):
ALTER TABLE "import_watermarks" RENAME COLUMN "last_updated_at" TO "updated_at";
ALTER TABLE "import_watermarks" ADD COLUMN "stream_type" VARCHAR(50);
ALTER TABLE "import_watermarks" ADD COLUMN "resource_id" VARCHAR(255);
ALTER TABLE "import_watermarks" ADD COLUMN "import_complete" BOOLEAN DEFAULT FALSE;
ALTER TABLE "import_watermarks" ADD COLUMN "created_at" TIMESTAMP DEFAULT NOW();
ALTER TABLE "import_watermarks" DROP COLUMN IF EXISTS "total_processed";
ALTER TABLE "import_watermarks" ALTER COLUMN "created_at" SET NOT NULL;
```

## Manual Fix Applied

For existing databases that already ran the partial migration:

```sql
-- Rename last_updated_at to updated_at
ALTER TABLE "import_watermarks" RENAME COLUMN "last_updated_at" TO "updated_at";

-- Add created_at with default value
ALTER TABLE "import_watermarks" ADD COLUMN "created_at" TIMESTAMP DEFAULT NOW();

-- Remove old column
ALTER TABLE "import_watermarks" DROP COLUMN IF EXISTS "total_processed";

-- Make created_at NOT NULL
ALTER TABLE "import_watermarks" ALTER COLUMN "created_at" SET NOT NULL;
```

## Verification

After applying the fix:

```bash
# Check table structure
psql -h localhost -p 5433 -U neardocs -d neardocs -c "\d import_watermarks"

# Regenerate Prisma client
npx prisma generate

# Validate schema
npx prisma validate
```

## Final Table Structure

```
Table "public.import_watermarks"
       Column       |              Type
--------------------+--------------------------------
 id                 | integer (PK)
 stream_id          | text (NOT NULL)
 last_imported_time | timestamp(3)
 last_imported_id   | text
 updated_at         | timestamp(3) (NOT NULL)
 stream_type        | varchar(50) (NOT NULL)
 resource_id        | varchar(255)
 import_complete    | boolean (DEFAULT FALSE)
 created_at         | timestamp (NOT NULL, DEFAULT NOW())
```

## Prevention

To prevent similar issues in the future:

1. **Always add default values** when adding NOT NULL columns to tables with data
2. **Test migrations** on a copy of production data before applying
3. **Use rename operations** instead of drop+add when changing column names
4. **Document column mappings** clearly in migration comments

## Files Modified

1. `prisma/migrations/20251031000000_batch_processing_architecture/migration.sql`
   - Added missing column rename
   - Added missing created_at column with default
   - Added missing total_processed drop

## Status

✅ **Fixed** - Migration now properly handles all column transformations with existing data
✅ **Verified** - Prisma schema validation passes
✅ **Tested** - Server starts successfully with updated schema
