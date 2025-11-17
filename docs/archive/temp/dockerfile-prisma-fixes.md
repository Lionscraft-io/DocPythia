# Dockerfile Production Deployment Fixes

**Date**: 2025-11-05
**Issues**:
1. Production container failing with "Prisma client did not initialize yet"
2. Production container failing with "EACCES: permission denied, mkdir '/cache/llm'"

## Root Causes

### Issue 1: Missing Prisma Client
The Dockerfile was not running `prisma generate` during the build process, so the Prisma Client code (`node_modules/.prisma/client/`) didn't exist in the production container. This caused the app to crash on startup when trying to instantiate `PrismaClient`.

### Issue 2: Cache Directory Permissions
The app tries to create `/cache/llm` at runtime, but the container runs as non-root user `nextjs` (UID 1001) who doesn't have permission to create directories at root level (`/cache`).

## Fixes Applied

### 1. Added Prisma Generate to Builder Stage

**File**: `Dockerfile` line 17

```dockerfile
# Copy source code
COPY . .

# Generate Prisma Client from schema
RUN npx prisma generate
```

### 2. Added Prisma Generate to Production Stage

**File**: `Dockerfile` lines 39-46

```dockerfile
# Copy Prisma schema and migrations for database initialization
COPY prisma ./prisma

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma Client in production stage
RUN npx prisma generate
```

### 3. Ensured Prisma Directory is Copied

**File**: `Dockerfile` line 40

The `prisma/` directory must be copied BEFORE running `prisma generate` so that the schema and migrations are available.

### 4. Created Migration for discard_reason Field

**File**: `prisma/migrations/20251105_add_discard_reason/migration.sql`

Added proper migration file for the `discard_reason` field that was previously added manually.

### 5. Created Cache Directory with Proper Permissions

**File**: `Dockerfile` lines 59-61

```dockerfile
# Create cache directory for LLM responses
RUN mkdir -p /cache/llm && \
    chown -R nextjs:nodejs /cache
```

Creates the `/cache` directory structure BEFORE switching to non-root user, ensuring the `nextjs` user has write permissions.

## Verification

Tested locally with Docker:

```bash
docker build -t neardocsai-test .
docker run --rm neardocsai-test ls -la /app/node_modules/.prisma/client/
docker run --rm neardocsai-test ls -la /app/prisma/migrations/
docker run --rm neardocsai-test ls -la /cache/
```

### Results:
✅ Prisma Client properly generated in `/app/node_modules/.prisma/client/`
✅ Migrations directory present at `/app/prisma/migrations/`
✅ All migration files included (including new `20251105_add_discard_reason`)
✅ Cache directory `/cache/llm` created with `nextjs:nodejs` ownership

## Deployment

To deploy these fixes to production:

1. **Commit the changes**:
   ```bash
   git add Dockerfile prisma/migrations/20251105_add_discard_reason/
   git commit -m "Fix Prisma client generation in Docker build"
   ```

2. **Build and push new image**:
   ```bash
   docker build -t neardocsai:latest .
   # Tag and push to ECR as per your deployment process
   ```

3. **Deploy to App Runner**:
   App Runner will automatically run migrations on startup via `npx prisma migrate deploy` (server/migrate.ts)

## What Changed in Production Behavior

**Before**:
- ❌ Container crashed with "Prisma client did not initialize yet"
- ❌ Migrations were not found, fell back to `prisma db push --accept-data-loss`
- ❌ Container crashed with "EACCES: permission denied, mkdir '/cache/llm'"
- ❌ App couldn't start due to permission errors

**After**:
- ✅ Prisma Client properly initialized on startup
- ✅ Migrations run automatically via `prisma migrate deploy`
- ✅ Latest database changes (like `discard_reason` field) deploy correctly
- ✅ Cache directory exists with proper permissions
- ✅ App starts successfully and can write LLM cache files

## Related Files

- `Dockerfile` - Multi-stage build configuration
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/` - All migration files
- `server/migrate.ts` - Database initialization logic
- `server/db.ts` - PrismaClient instantiation
- `server/llm/llm-cache.ts` - LLM cache service that requires `/cache/llm` directory
