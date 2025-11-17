# Production Database Reset Instructions

**Date**: 2025-11-05
**Issue**: Production database has old Drizzle schema but app expects Prisma schema
**Solution**: Reset database and let Prisma migrations create fresh schema

## WARNING ⚠️

**THIS WILL DELETE ALL DATA IN THE PRODUCTION DATABASE**

- All documentation sections
- All pending updates
- All scraped messages
- All conversation analysis
- All proposals

Only proceed if you're okay losing this data.

## Steps to Reset Production Database

### 1. Connect to Production Database

```bash
# Get connection details from DATABASE_URL environment variable
# Format: postgresql://username:password@host:port/database

# Example connection:
psql "postgresql://username:password@expertgpt-instance-1.cd6c4480gef6.eu-central-1.rds.amazonaws.com:5432/autodoc"
```

### 2. Run Reset SQL

```bash
# Copy the SQL file to your local machine
# Then run it against production database

psql -h expertgpt-instance-1.cd6c4480gef6.eu-central-1.rds.amazonaws.com \
     -U <username> \
     -d autodoc \
     -f scripts/permanent/reset-production-database.sql
```

Or paste the contents directly into psql:

```sql
\i scripts/permanent/reset-production-database.sql
```

### 3. Verify Database is Empty

```sql
-- Should return no tables (except maybe pg_ system tables)
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Should return empty
SELECT COUNT(*) FROM _prisma_migrations;
-- ERROR: relation "_prisma_migrations" does not exist (expected!)
```

### 4. Redeploy Application

After database is reset:

1. **Build new Docker image** with Prisma fixes
2. **Push to ECR**
3. **Deploy to App Runner**

On startup, the app will:
- Find migrations directory ✅
- Run `prisma migrate deploy` ✅
- Create all tables from scratch ✅
- Seed initial documentation ✅

### 5. Verify Deployment

Check App Runner logs for:

```
📁 Found migrations directory, running migrations...
Applying migration `20251029_add_pgvector_support`
Applying migration `20251030_create_admin_view`
Applying migration `20251031000000_batch_processing_architecture`
Applying migration `20251103_add_conversation_summary`
Applying migration `20251103_conversation_based_changesets`
Applying migration `20251104_add_proposal_rejection_fields`
Applying migration `20251105_add_discard_reason`
✅ Database migrations completed

📦 No documentation found, importing initial content...
✅ Initial documentation imported successfully

🚀 Server running on http://localhost:8080
```

## Alternative: Manual Migration (Preserve Data)

If you want to preserve production data instead of resetting:

1. Export current production data
2. Transform data to match new Prisma schema
3. Import into fresh database with Prisma schema

This requires custom SQL scripts for each table. Contact if you need this approach.

## Files

- `scripts/permanent/reset-production-database.sql` - SQL to drop all tables
- `Dockerfile` - Fixed to include Prisma generate and migrations
- `server/migrate.ts` - Runs migrations on startup
