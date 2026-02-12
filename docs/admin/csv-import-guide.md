# CSV Import Guide

Guide for importing CSV message files for documentation analysis.

## Quick Start

### Option 1: Using the Shell Script

```bash
./scripts/permanent/import-csv.sh /path/to/your/messages.csv
```

### Option 2: Using the TypeScript Script

```bash
npx tsx scripts/permanent/import-csv.ts /path/to/your/messages.csv
```

## CSV File Format

Your CSV file must have the following columns:

### Required Columns:
- `content` - The message text (required)
- `timestamp` or `date` - When the message was sent (required)

### Optional Columns:
- `author` or `user` - Who sent the message
- `channel` - Which channel/room it was sent in
- Any other columns will be stored as metadata

### Example CSV:

```csv
timestamp,content,author,channel
2025-10-30 10:00:00,How do I set up a validator node?,alice,validator-support
2025-10-30 10:15:00,The staking requirements have changed to 50000 tokens.,admin,announcements
2025-10-30 10:30:00,Documentation for RPC endpoints is outdated.,bob,documentation
```

## What Happens During Import

1. **File Upload** - CSV file is copied to inbox directory
2. **Processing** - Each message is:
   - ✅ Classified for documentation value (LLM-1)
   - ✅ Retrieved similar documentation via RAG
   - ✅ Analyzed for potential documentation updates (LLM-2)
   - ✅ Reviewed for quality and accuracy (LLM-3)
3. **Storage** - Results stored in database
4. **Report** - Processing report generated with statistics

## Viewing Results

### Via API:

```bash
# List all processed messages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3762/api/admin/stream/messages

# View statistics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3762/api/admin/stream/stats

# View specific message details
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3762/api/admin/stream/messages/123
```

### Via Admin Dashboard (Coming Soon):

The admin UI will display:
- All processed messages
- Classification results
- Documentation update proposals
- Review status (approved/pending/rejected)
- Confidence scores

## Configuration

Configure via environment variables in `.env`:

```bash
# CSV Processing
CSV_INBOX_DIR=/tmp/csv-test/inbox
CSV_PROCESSED_DIR=/tmp/csv-test/processed
STREAM_ID=csv-test

# API Connection
API_URL=http://localhost:3762
ADMIN_TOKEN=your_admin_token_here
```

## Troubleshooting

### File Still in Inbox After Import

**Cause:** Processing failed or timed out

**Solution:** Check server logs for errors:
```bash
# Check recent logs
tail -f /var/log/docpythia.log

# Or check processing reports
ls -la /tmp/csv-test/error/
```

### No Results in Database

**Cause:** Messages filtered out (no documentation value)

**Check:** Review classification results:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3762/api/admin/stream/messages?docValue=false
```

### API Connection Refused

**Cause:** Server not running or wrong port

**Solution:**
```bash
# Check if server is running
curl http://localhost:3762/api/health

# Start server if needed
npm run dev
```

## API Endpoints Reference

### Process CSV File
```bash
POST /api/admin/stream/process
Authorization: Bearer {token}
Content-Type: application/json

{
  "streamId": "csv-test",
  "batchSize": 100
}
```

### List Messages
```bash
GET /api/admin/stream/messages?page=1&limit=20&docValue=true
Authorization: Bearer {token}
```

### Get Message Details
```bash
GET /api/admin/stream/messages/:id
Authorization: Bearer {token}
```

### Get Statistics
```bash
GET /api/admin/stream/stats
Authorization: Bearer {token}
```

## Advanced Usage

### Batch Import Multiple Files

```bash
#!/bin/bash
for file in /path/to/csv/files/*.csv; do
  echo "Processing $file..."
  npx tsx scripts/permanent/import-csv.ts "$file"
  sleep 5  # Wait between imports
done
```

### Custom Column Mapping

If your CSV has different column names, update the stream configuration:

```sql
UPDATE stream_configs
SET config = jsonb_set(
  config,
  '{columnMapping}',
  '{"timestamp": "date_sent", "content": "message_text", "author": "sender"}'::jsonb
)
WHERE stream_id = 'csv-test';
```

## Next Steps

After importing messages:

1. **Review Proposals** - Check documentation update suggestions
2. **Approve/Reject** - Accept or decline proposed changes
3. **Phase 2** - Approved changes will be batched into PRs (coming soon)

---

**Need Help?** Contact the development team or check the main [Phase 1 Specification](/docs/specs/multi-stream-scanner-phase-1.md).
