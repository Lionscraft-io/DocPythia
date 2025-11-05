# Documentation Index Database Caching Implementation

**Date**: 2025-10-30
**Issue**: Documentation index was regenerated on-demand with 1-hour cache, wasting resources when docs haven't changed

## Problem

The previous implementation:
- Generated index on-demand whenever LLM needed it
- Cached in memory for 1 hour
- Regenerated even when documentation hadn't changed
- Not shared across multiple server instances
- Manual cache invalidation wasn't tied to actual doc changes

## Solution Implemented

### Database-Backed Caching

Created new `doc_index_cache` table to store pre-computed documentation indexes:

```sql
CREATE TABLE doc_index_cache (
  id SERIAL PRIMARY KEY,
  commit_hash TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  index_data JSONB NOT NULL,
  compact_index TEXT NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(commit_hash, config_hash)
);
```

### Key Features

1. **Commit Hash Tracking**
   - Index tied to git commit hash of documentation
   - Only regenerates when docs actually change
   - Automatic invalidation on doc sync

2. **Config Hash Tracking**
   - Detects changes to filter configuration
   - Regenerates if config changes (e.g., different excludePatterns)
   - Allows multiple indexes for same commit with different configs

3. **Efficient Lookups**
   - Indexed by (commit_hash, config_hash)
   - Fast database queries vs expensive generation
   - Shared across all server instances

4. **Pre-Computed Formats**
   - Stores both full JSON index and compact text format
   - Compact format ready for LLM prompts
   - No formatting overhead on retrieval

## Implementation Details

### File: `prisma/schema.prisma`

Added `DocIndexCache` model:

```prisma
model DocIndexCache {
  id           Int      @id @default(autoincrement())
  commitHash   String   @map("commit_hash")
  configHash   String   @map("config_hash")
  indexData    Json     @map("index_data")
  compactIndex String   @map("compact_index") @db.Text
  generatedAt  DateTime @default(now()) @map("generated_at")

  @@unique([commitHash, configHash])
  @@map("doc_index_cache")
}
```

### File: `server/stream/doc-index-generator.ts`

**Changes**:
1. Removed in-memory cache (cache, cacheExpiry)
2. Added config hash generation
3. Added database load/save methods
4. Updated `generateIndex()` to check DB first
5. Made `invalidateCache()` async and DB-backed
6. Updated `getCacheStatus()` to query database

**Key Methods**:

```typescript
// Generate MD5 hash of config to detect changes
private generateConfigHash(): string {
  const configString = JSON.stringify(this.config, Object.keys(this.config).sort());
  return crypto.createHash('md5').update(configString).digest('hex');
}

// Get current git commit hash
private async getCurrentCommitHash(): Promise<string | null> {
  const syncState = await prisma.gitSyncState.findFirst({
    where: { gitUrl: process.env.DOCS_GIT_URL }
  });
  return syncState?.lastCommitHash || null;
}

// Load from database
private async loadFromDatabase(commitHash: string): Promise<DocumentationIndex | null> {
  const cached = await prisma.docIndexCache.findUnique({
    where: { commitHash_configHash: { commitHash, configHash: this.configHash } }
  });
  return cached?.indexData as DocumentationIndex;
}

// Save to database
private async saveToDatabase(commitHash: string, index: DocumentationIndex): Promise<void> {
  await prisma.docIndexCache.upsert({
    where: { commitHash_configHash: { commitHash, configHash: this.configHash } },
    create: { commitHash, configHash: this.configHash, indexData: index, compactIndex },
    update: { indexData: index, compactIndex, generatedAt: new Date() }
  });
}
```

**Updated Generation Flow**:

```typescript
async generateIndex(): Promise<DocumentationIndex> {
  // 1. Get current commit hash
  const commitHash = await this.getCurrentCommitHash();

  // 2. Try to load from database
  if (commitHash) {
    const cachedIndex = await this.loadFromDatabase(commitHash);
    if (cachedIndex) return cachedIndex;
  }

  // 3. Generate fresh index
  const index = await this.generateFromDatabase();

  // 4. Save to database
  if (commitHash) {
    await this.saveToDatabase(commitHash, index);
  }

  return index;
}
```

### File: `server/routes.ts`

Updated sync endpoint to invalidate cache:

```typescript
// After successful sync
await docIndexGenerator.invalidateCache();
```

This deletes the cached index for the current commit hash, forcing regeneration on next request.

### File: `server/scripts/inspect-doc-index.ts`

Updated to use new async `getCacheStatus()` method.

## Workflow

### First Time Documentation Sync

1. User clicks "Sync Docs" button
2. Git fetcher pulls latest docs (commit hash: `abc123`)
3. Documents stored in `document_pages` table
4. Sync completes, invalidates any cached index
5. No index exists yet in database

### First LLM Request

1. Message processor needs doc index for prompt
2. Calls `generateIndex()`
3. Gets commit hash: `abc123`
4. Checks database for index with (commit: `abc123`, config: `def456`)
5. Not found → generates fresh index
6. Filters 1914 docs → 50 pages
7. Saves to database with compact format
8. Returns index for LLM prompt

### Subsequent LLM Requests

1. Message processor needs doc index
2. Calls `generateIndex()`
3. Gets commit hash: `abc123`
4. Checks database for index with (commit: `abc123`, config: `def456`)
5. **Found! Returns cached index instantly**
6. No regeneration needed

### Documentation Update

1. User clicks "Sync Docs" button
2. Git fetcher detects new commit hash: `xyz789`
3. Updates database with new docs
4. Invalidates cache for old commit `abc123`
5. Next LLM request generates new index for `xyz789`

### Configuration Change

1. User edits `/config/doc-index.config.json`
2. Changes `maxPages` from 50 to 30
3. Server restart loads new config
4. Config hash changes: `def456` → `ghi789`
5. Next LLM request:
   - Checks for (commit: `abc123`, config: `ghi789`)
   - Not found → regenerates with new filters
   - Saves new index to database
6. Old index (commit: `abc123`, config: `def456`) remains in DB

## Benefits

### Performance

**Before**:
- Generate index on every LLM request (after 1hr cache expires)
- ~500ms generation time
- Multiple instances = multiple generations

**After**:
- Generate once per commit hash
- ~5ms database query
- All instances share same cache

### Consistency

**Before**:
- Different instances might have different indexes
- Cache expiry could happen mid-batch
- Manual invalidation not tied to actual changes

**After**:
- All instances use same index for same commit
- Tied directly to documentation version
- Automatic invalidation on sync

### Resource Usage

**Before**:
- Frequent regeneration
- High CPU usage
- Memory overhead for cache

**After**:
- Regenerate only on doc/config changes
- Minimal CPU usage
- Database handles caching

## Database Query Performance

```sql
-- Index lookup (fast - uses unique index)
SELECT index_data, compact_index
FROM doc_index_cache
WHERE commit_hash = 'abc123' AND config_hash = 'def456';

-- Typical: <5ms with proper indexing
```

## Monitoring

### Check Cache Status

```bash
npx tsx server/scripts/inspect-doc-index.ts
```

Output:
```
Cache Status:
  Cached: true
  Commit Hash: abc12345
  Generated At: 2025-10-30T12:00:00.000Z
```

### Database Queries

```sql
-- See all cached indexes
SELECT
  id,
  LEFT(commit_hash, 8) as commit,
  LEFT(config_hash, 8) as config,
  generated_at,
  LENGTH(compact_index) as compact_size
FROM doc_index_cache
ORDER BY generated_at DESC;

-- See index for current commit
SELECT * FROM doc_index_cache
WHERE commit_hash = (
  SELECT last_commit_hash FROM git_sync_state
  WHERE git_url = 'https://github.com/near/docs'
);
```

## Cache Invalidation

### Automatic (Sync Button)

When user clicks sync:
1. Deletes cached index for current commit + config
2. Next LLM request regenerates with latest data

### Manual (Config Change)

When config changes:
1. Server restart loads new config with new hash
2. Database query fails to find matching (commit, config)
3. Auto-regenerates with new filters

### Manual (Database)

```sql
-- Delete all cached indexes
DELETE FROM doc_index_cache;

-- Delete for specific commit
DELETE FROM doc_index_cache WHERE commit_hash = 'abc123';

-- Delete for specific config
DELETE FROM doc_index_cache WHERE config_hash = 'def456';
```

## Rollback Plan

If issues occur:

1. **Revert code changes** to use in-memory cache
2. **Drop table**: `DROP TABLE doc_index_cache;`
3. **Restore previous generator**: Use git to restore old `doc-index-generator.ts`

## Files Changed

1. `prisma/schema.prisma` - Added `DocIndexCache` model
2. `server/stream/doc-index-generator.ts` - Database-backed caching
3. `server/routes.ts` - Invalidate cache on sync
4. `server/scripts/inspect-doc-index.ts` - Updated for async cache status

## Testing

### Verify Caching Works

```bash
# 1. Run inspector (should generate and save to DB)
npx tsx server/scripts/inspect-doc-index.ts

# 2. Check database
psql -h localhost -p 5433 -U neardocs -d neardocs \
  -c "SELECT COUNT(*) FROM doc_index_cache;"

# 3. Run inspector again (should load from DB)
npx tsx server/scripts/inspect-doc-index.ts
# Look for "Loaded doc-index from database" message

# 4. Click sync button (should invalidate)
# 5. Process a message (should regenerate)
```

### Verify Config Changes Detected

```bash
# 1. Edit /config/doc-index.config.json (change maxPages)
# 2. Restart server
# 3. Process a message
# Look for "Generating fresh documentation index..." (not "Loaded from database")
# 4. Check database - should have 2 entries (different config hashes)
```

## Future Enhancements

1. **Cleanup old indexes**: Periodically delete indexes for old commits
2. **Analytics**: Track cache hit/miss rates
3. **Pre-warming**: Generate index immediately after sync
4. **Compression**: Compress compact_index to save space
5. **Versioning**: Track index schema version for migrations
