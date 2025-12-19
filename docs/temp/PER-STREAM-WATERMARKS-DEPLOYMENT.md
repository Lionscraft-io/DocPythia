# Per-Stream Watermarks Deployment Guide
**Author:** Wayne
**Date:** 2025-11-18
**Critical Fix:** Prevents Zulip historical messages from being skipped

## Problem Summary

### Issue 1: Global Watermark Skips Stream History
- **Root Cause:** Single global watermark for all streams
- **Impact:** If Telegram processed messages through Oct 2025, the watermark moves to Oct 2025
- **Result:** When Zulip is added with messages from Jan 2024, ALL historical messages are skipped because they're before the Oct 2025 watermark

### Issue 2: Streams Mixed in Processing
- Zulip and Telegram messages were processed together in a single batch
- Zulip topics were ignored, causing all Zulip messages to get the same conversationId
- LLM couldn't distinguish between different platforms' conversations

## Solution: Per-Stream Watermarks

Each stream now maintains its own independent watermark, allowing:
- ✅ Zulip to process from Jan 2024 while Telegram processes from Oct 2025
- ✅ Each stream processed separately with proper context
- ✅ Zulip topics included in message format and conversation IDs
- ✅ Historical data properly captured for new streams

## Changes Made

### 1. Schema Changes (Prisma)
**File:** `prisma/schema.prisma`

```prisma
// OLD: Global watermark
model ProcessingWatermark {
  id                  Int       @id @default(1)
  watermarkTime       DateTime
  ...
}

// NEW: Per-stream watermarks
model ProcessingWatermark {
  id                  Int       @id @default(autoincrement())
  streamId            String    @unique
  watermarkTime       DateTime
  ...
}
```

### 2. Batch Processor Changes
**File:** `server/stream/processors/batch-message-processor.ts`

- `getProcessingWatermark(streamId: string)` - Per-stream watermark retrieval
- `updateProcessingWatermark(streamId: string, newTime: Date)` - Per-stream updates
- Main loop now processes each stream independently
- Zulip topics added to message format for LLM
- Zulip topics added to conversation IDs for uniqueness

### 3. Migration Script
**File:** `scripts/permanent/migrate-to-per-stream-watermarks.sql`

Safely migrates from global to per-stream watermarks.

## Deployment Steps for Production

### Step 1: Run Database Migration
```bash
psql $DATABASE_URL < scripts/permanent/migrate-to-per-stream-watermarks.sql
```

This will:
- Backup existing watermark
- Create new per-stream watermark table
- Initialize watermarks for each existing stream based on earliest message

### Step 2: Update Configuration Files

**config/near/instance.json:**
```json
{
  "streamId": "near-zulip-community-support",
  "config": {
    "batchSize": 1000,           // Changed from 100
    "ignoreOldMessages": false    // Changed from true
  }
}
```

**.env:**
```bash
# Enable stream scheduling
STREAM_SCHEDULING_ENABLED=true

# Increase batch window to 7 days
BATCH_WINDOW_HOURS=168
CONTEXT_WINDOW_HOURS=168

# Add Zulip credentials
ZULIP_BOT_EMAIL=julian@lionscraft.io
ZULIP_API_KEY=FZKYQEcNRpGh5z5ApQVZ0WWrxUJ23Pdo
ZULIP_SITE=https://near.zulipchat.com
```

### Step 3: Reset Stream Watermarks (Optional)
If you want to reprocess existing messages:

```bash
# Reset all streams
npx tsx scripts/permanent/reset-processing-watermark.ts

# Or reset specific stream
npx tsx scripts/permanent/reset-processing-watermark.ts near-zulip-community-support
```

### Step 4: Deploy Code Changes
```bash
# Pull latest code
git pull

# Install dependencies (if schema changed)
npm install

# Generate Prisma client
npx prisma generate

# Restart server
pm2 restart your-app  # or your restart command
```

### Step 5: Verify

1. Check watermarks in database:
```sql
SELECT * FROM processing_watermark ORDER BY stream_id;
```

2. Trigger processing:
- Go to admin dashboard
- Click "Process Messages"
- Watch logs for per-stream processing

3. Expected logs:
```
[BatchProcessor] Found 2 streams with pending messages
[BatchProcessor] ========== PROCESSING STREAM: near-zulip-community-support ==========
[BatchProcessor] Stream near-zulip-community-support watermark: 2024-01-01T00:00:00.000Z
...
[BatchProcessor] ========== PROCESSING STREAM: near-telegram-validators ==========
[BatchProcessor] Stream near-telegram-validators watermark: 2025-10-29T12:50:00.000Z
```

## Verification Queries

**Check stream watermarks:**
```sql
SELECT
  stream_id,
  watermark_time,
  last_processed_batch
FROM processing_watermark
ORDER BY stream_id;
```

**Check pending messages per stream:**
```sql
SELECT
  stream_id,
  COUNT(*) as pending_count,
  MIN(timestamp) as oldest,
  MAX(timestamp) as newest
FROM unified_messages
WHERE processing_status = 'PENDING'
GROUP BY stream_id
ORDER BY stream_id;
```

**Check Zulip topic distribution:**
```sql
SELECT
  metadata->>'topic' as topic,
  COUNT(*) as message_count
FROM unified_messages
WHERE stream_id = 'near-zulip-community-support'
GROUP BY metadata->>'topic'
ORDER BY message_count DESC
LIMIT 20;
```

## Rollback Plan

If issues occur:

1. **Database rollback** (if you have a backup):
```sql
-- Restore from backup
\i /path/to/backup.sql
```

2. **Code rollback**:
```bash
git checkout <previous-commit>
npm install
npx prisma generate
pm2 restart your-app
```

## Expected Results

After deployment:

1. **Zulip stream** starts processing from earliest message (Jan 2024)
2. **Telegram stream** continues from its watermark (Oct 2025)
3. **Zulip topics** appear in conversation summaries and have unique IDs
4. **No duplicate conversations** between Zulip and Telegram
5. **Automatic scraping** runs every 30 minutes (configurable)
6. **Historical backfill** completes over time as batches process

## Monitoring

Watch for:
- ✅ Per-stream watermark updates in logs
- ✅ Increasing message counts in database
- ✅ Distinct conversation IDs per Zulip topic
- ❌ Any watermark stuck at same timestamp
- ❌ Messages being skipped

## Support

If issues arise:
1. Check logs for errors
2. Verify watermarks are advancing per stream
3. Run verification queries above
4. Contact Wayne with specific error messages
