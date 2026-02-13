# Stream Configuration Guide

This guide covers configuring message streams (Zulip, Telegram, CSV) and handling historical message backfill.

## Stream Types

DocPythia supports the following stream adapters:

| Type | Description |
|------|-------------|
| `zulipchat` | Zulip chat channels |
| `telegram-bot` | Telegram channels via bot |
| `csv` | CSV file import |

## Basic Configuration

Streams are configured in `config/<instance>/instance.json`:

```json
{
  "streams": [
    {
      "streamId": "my-zulip-stream",
      "type": "zulipchat",
      "enabled": true,
      "config": {
        "site": "https://myorg.zulipchat.com",
        "email": "bot@myorg.zulipchat.com",
        "apiKey": "your-api-key",
        "channel": "community-support",
        "batchSize": 100
      }
    }
  ]
}
```

## Message Fetching Behavior

### Default Behavior (No Watermark)

When a stream has no watermark (first run), the adapter fetches the **last 100 messages** from "newest" going backwards:

```
anchor = 'newest'
numBefore = batchSize (default: 100)
numAfter = 0
```

### Incremental Fetching (With Watermark)

After the first fetch, subsequent fetches get messages **after** the watermark:

```
anchor = lastProcessedId
numBefore = 0
numAfter = batchSize (default: 100)
```

This means the adapter only fetches **new** messages going forward.

## Historical Backfill

To pull historical messages (e.g., all messages since January 2024), you need to configure a `startDate` and trigger multiple imports.

### Step 1: Configure `startDate`

Add `startDate` to your stream config:

```json
{
  "streams": [
    {
      "streamId": "my-zulip-stream",
      "type": "zulipchat",
      "enabled": true,
      "config": {
        "site": "https://myorg.zulipchat.com",
        "email": "bot@myorg.zulipchat.com",
        "apiKey": "your-api-key",
        "channel": "community-support",
        "batchSize": 100,
        "startDate": "2024-01-01T00:00:00Z"
      }
    }
  ]
}
```

### Step 2: Reset the Watermark

Reset the stream watermark to clear any existing position:

```bash
curl -X POST "https://your-domain.com/<instance>/api/admin/stream/<streamId>/reset" \
  -H "Authorization: Bearer <admin-token>"
```

### Step 3: Trigger Repeated Imports

Each import fetches `batchSize` messages (default 100). You need to trigger multiple imports to pull all historical messages:

```bash
# Trigger a single import
curl -X POST "https://your-domain.com/<instance>/api/admin/stream/<streamId>/import" \
  -H "Authorization: Bearer <admin-token>"
```

The watermark advances with each import. Continue triggering imports until no new messages are returned.

### Automating Backfill

You can automate the backfill with a simple script:

```bash
#!/bin/bash
INSTANCE="myinstance"
STREAM_ID="my-zulip-stream"
BASE_URL="https://your-domain.com"
TOKEN="your-admin-token"

# Reset watermark first
curl -X POST "$BASE_URL/$INSTANCE/api/admin/stream/$STREAM_ID/reset" \
  -H "Authorization: Bearer $TOKEN"

# Pull messages in batches until caught up
while true; do
  RESULT=$(curl -s -X POST "$BASE_URL/$INSTANCE/api/admin/stream/$STREAM_ID/import" \
    -H "Authorization: Bearer $TOKEN")

  COUNT=$(echo $RESULT | jq -r '.messagesImported // 0')
  echo "Imported $COUNT messages"

  if [ "$COUNT" -eq 0 ]; then
    echo "Backfill complete!"
    break
  fi

  sleep 1  # Rate limiting
done
```

## Full Scrape (Alternative Method)

For one-time historical backfill, the legacy scraper can fetch ALL messages in a single operation by paginating backwards from "newest":

```bash
curl -X POST "https://your-domain.com/api/admin/scrape" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"channel": "community-support", "numMessages": 1000}'
```

Note: The legacy scraper stores messages in a different table (`scraped_messages`) than the stream system (`stream_messages`).

## Watermark Management

### View Watermark Status

```bash
curl "https://your-domain.com/<instance>/api/admin/stream/<streamId>/status" \
  -H "Authorization: Bearer <admin-token>"
```

### Reset Watermark

Clears the watermark to allow re-importing from `startDate`:

```bash
curl -X POST "https://your-domain.com/<instance>/api/admin/stream/<streamId>/reset" \
  -H "Authorization: Bearer <admin-token>"
```

## Configuration Reference

### Zulip Stream Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `site` | string | Yes | Zulip server URL (e.g., `https://myorg.zulipchat.com`) |
| `email` | string | Yes | Bot email address |
| `apiKey` | string | Yes | Bot API key |
| `channel` | string | Yes | Channel/stream name to monitor |
| `batchSize` | number | No | Messages per fetch (default: 100, max: 1000) |
| `startDate` | string | No | ISO date to start fetching from (e.g., `2024-01-01T00:00:00Z`) |

### Telegram Stream Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `botToken` | string | Yes | Telegram bot token |
| `chatId` | string | Yes | Chat/channel ID to monitor |
| `batchSize` | number | No | Messages per fetch (default: 100) |

### CSV Stream Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inboxDir` | string | Yes | Directory to watch for CSV files |
| `processedDir` | string | Yes | Directory to move processed files |
| `columnMapping` | object | Yes | Mapping of CSV columns to message fields |

## Database Queries

### Check Import Watermark

The import watermark tracks which messages have been fetched from the source:

```sql
-- View all import watermarks
SELECT * FROM import_watermarks ORDER BY updated_at DESC;

-- Check specific stream watermark
SELECT
  stream_id,
  last_imported_id,
  last_imported_time,
  total_imported,
  updated_at
FROM import_watermarks
WHERE stream_id = 'my-zulip-stream';
```

### Check Processing Watermark

The processing watermark tracks which messages have been analyzed by the AI:

```sql
-- View all processing watermarks
SELECT * FROM processing_watermarks ORDER BY watermark_time DESC;

-- Check specific stream processing progress
SELECT
  stream_id,
  watermark_time,
  last_processed_batch,
  updated_at
FROM processing_watermarks
WHERE stream_id = 'my-zulip-stream';
```

### Count Messages by Stream

```sql
-- Count all messages per stream
SELECT
  stream_id,
  COUNT(*) as total_messages,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM stream_messages
GROUP BY stream_id;

-- Count messages by processing status
SELECT
  stream_id,
  processing_status,
  COUNT(*) as count
FROM stream_messages
GROUP BY stream_id, processing_status
ORDER BY stream_id, processing_status;
```

### Check for Gaps in Message History

```sql
-- Find date ranges with messages
SELECT
  stream_id,
  DATE(timestamp) as message_date,
  COUNT(*) as message_count
FROM stream_messages
GROUP BY stream_id, DATE(timestamp)
ORDER BY stream_id, message_date;
```

### Reset Watermark Manually

If you need to reset a watermark directly in the database:

```sql
-- Reset import watermark (allows re-fetching from startDate)
DELETE FROM import_watermarks WHERE stream_id = 'my-zulip-stream';

-- Or update to a specific position
UPDATE import_watermarks
SET last_imported_id = NULL,
    last_imported_time = NULL,
    updated_at = NOW()
WHERE stream_id = 'my-zulip-stream';

-- Reset processing watermark (allows re-processing messages)
DELETE FROM processing_watermarks WHERE stream_id = 'my-zulip-stream';
```

### View Recent Message Imports

```sql
-- Last 20 imported messages for a stream
SELECT
  message_id,
  content,
  timestamp,
  processing_status,
  created_at
FROM stream_messages
WHERE stream_id = 'my-zulip-stream'
ORDER BY timestamp DESC
LIMIT 20;
```

## Troubleshooting

### Only 100 messages imported

This is expected default behavior. Configure `startDate` and use repeated imports for historical backfill.

### Watermark not advancing

Check that messages have unique IDs and timestamps. The watermark only advances when new messages are successfully imported.

```sql
-- Debug: Check if watermark matches latest message
SELECT
  iw.stream_id,
  iw.last_imported_id as watermark_id,
  iw.last_imported_time as watermark_time,
  sm.message_id as latest_message_id,
  sm.timestamp as latest_message_time
FROM import_watermarks iw
LEFT JOIN (
  SELECT stream_id, message_id, timestamp
  FROM stream_messages
  WHERE (stream_id, timestamp) IN (
    SELECT stream_id, MAX(timestamp) FROM stream_messages GROUP BY stream_id
  )
) sm ON iw.stream_id = sm.stream_id;
```

### Rate limiting errors

Add delays between import requests. Zulip has rate limits of approximately 200 requests per minute.
