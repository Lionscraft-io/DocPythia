# Zulip Stream Setup Guide

**Author:** Wayne
**Date:** 2025-11-17
**Purpose:** Configure Zulip chat integration for multi-tenant documentation analysis

---

## Overview

This guide explains how to set up Zulip stream adapters to automatically ingest messages from Zulip channels for documentation analysis. The system supports:

- **Multi-tenant configuration** - Different Zulip orgs per instance (NEAR, Conflux, etc.)
- **Pull-based polling** - Fetches messages every 30 seconds (configurable)
- **Watermark tracking** - Resumes from last message on restart
- **Concurrent streams** - Run Zulip alongside Telegram, CSV, etc.

---

## Prerequisites

1. **Zulip Organization Access**
   - Admin access to your Zulip organization
   - Ability to create bots

2. **Database Access**
   - PostgreSQL database per instance
   - Ability to insert stream configurations

3. **Environment Variables**
   - Access to set environment variables (`.env` file or cloud config)

---

## Step 1: Create Zulip Bot

### 1.1 Navigate to Bot Settings

1. Log in to your Zulip organization (e.g., `https://near.zulipchat.com`)
2. Click your profile icon → **Personal settings**
3. Navigate to **Bots** section
4. Click **Add a new bot**

### 1.2 Create Generic Bot

- **Bot type:** Generic bot
- **Full name:** `NearDocs Bot` (or your project name)
- **Bot username:** `neardocs-bot` (or your choice)
- **Bot email:** Automatically generated (e.g., `neardocs-bot@zulipchat.com`)

### 1.3 Copy Credentials

After creating the bot:

1. **Copy the API key** - Long string like `abc123xyz456def789ghi`
2. **Copy the bot email** - Format: `your-bot@zulipchat.com`
3. **Save these securely** - You'll need them for configuration

### 1.4 Subscribe Bot to Channel

1. Navigate to the channel you want to monitor (e.g., `#community-support`)
2. Click the channel settings (gear icon)
3. Select **Add subscribers**
4. Add your bot to the channel
5. Verify the bot appears in the subscriber list

### 1.5 Grant Bot Permissions (Optional)

For most use cases, default bot permissions are sufficient. If needed:

1. Go to **Organization settings** → **Bot permissions**
2. Ensure bots can:
   - Read messages in public streams (default: yes)
   - Access message history (default: yes)

---

## Step 2: Configure Environment Variables

### 2.1 Per-Instance Configuration (Recommended)

For multi-tenant deployments, use instance-specific variables:

**NEAR Instance:**
```bash
# .env or cloud environment
NEAR_ZULIP_BOT_EMAIL=neardocs-bot@near.zulipchat.com
NEAR_ZULIP_API_KEY=abc123xyz456def789ghi
```

**Conflux Instance:**
```bash
CONFLUX_ZULIP_BOT_EMAIL=confluxdocs-bot@conflux.zulipchat.com
CONFLUX_ZULIP_API_KEY=xyz789def456abc123ghi
```

**Pattern:** `{INSTANCE_UPPERCASE}_ZULIP_BOT_EMAIL` and `{INSTANCE_UPPERCASE}_ZULIP_API_KEY`

### 2.2 Generic Configuration (Fallback)

If you have a single Zulip org:

```bash
ZULIP_BOT_EMAIL=bot@zulipchat.com
ZULIP_API_KEY=your_api_key_here
ZULIP_SITE=https://yourorg.zulipchat.com
```

### 2.3 Optional Configuration

```bash
# Polling interval (default: 30000ms = 30 seconds)
ZULIP_POLLING_INTERVAL=30000

# Messages to fetch per poll (default: 100)
ZULIP_BATCH_SIZE=100

# Ignore old messages (default: true)
ZULIP_IGNORE_OLD_MESSAGES=true
```

---

## Step 3: Create Stream Configuration in Database

### 3.1 Connect to Your Instance Database

For **NEAR** instance:
```bash
# Connect to neardocs database
psql "postgresql://username:password@host:port/neardocs"
```

For **Conflux** instance:
```bash
# Connect to confluxdocs database
psql "postgresql://username:password@host:port/confluxdocs"
```

### 3.2 Insert Stream Configuration

```sql
-- NEAR Zulip Stream
INSERT INTO stream_configs (
  stream_id,
  adapter_type,
  config,
  enabled,
  schedule,
  created_at,
  updated_at
) VALUES (
  'near-zulip-community-support',
  'zulip',
  '{
    "site": "https://near.zulipchat.com",
    "channel": "community-support",
    "pollingInterval": 30000,
    "batchSize": 100,
    "ignoreOldMessages": true
  }'::jsonb,
  true,
  '*/30 * * * *',
  NOW(),
  NOW()
);
```

**Configuration Fields:**

- `stream_id`: Unique identifier (format: `{instance}-zulip-{channel}`)
- `adapter_type`: Must be `"zulip"`
- `config`: JSON object with:
  - `site`: Zulip organization URL
  - `channel`: Stream/channel name to monitor
  - `pollingInterval`: How often to poll (milliseconds)
  - `batchSize`: Messages per fetch
  - `ignoreOldMessages`: Skip historical messages
- `enabled`: `true` to activate, `false` to disable
- `schedule`: Cron expression (e.g., `*/30 * * * *` = every 30 minutes)

### 3.3 Verify Configuration

```sql
-- Check stream config
SELECT * FROM stream_configs WHERE stream_id = 'near-zulip-community-support';

-- Check watermark (will be created on first run)
SELECT * FROM import_watermarks WHERE stream_id = 'near-zulip-community-support';
```

---

## Step 4: Restart Application

The StreamManager will automatically:
1. Detect the new Zulip stream configuration
2. Initialize the ZulipBotAdapter
3. Test the connection to Zulip API
4. Start polling for messages

**Check logs for:**
```
StreamManager initialized with X streams across Y instances
Registering stream: near-zulip-community-support (zulip) for instance: near
Using Zulip email from NEAR_ZULIP_BOT_EMAIL (env)
Using Zulip API key from NEAR_ZULIP_API_KEY (env)
Zulip connection successful. Bot: neardocs-bot@near.zulipchat.com
ZulipBotAdapter initialized for channel: community-support
Stream near-zulip-community-support registered successfully for instance near
```

---

## Step 5: Verify Messages Are Being Ingested

### 5.1 Check Database

```sql
-- Check unified messages from Zulip
SELECT
  message_id,
  timestamp,
  author,
  LEFT(content, 50) as preview,
  processing_status
FROM unified_messages
WHERE stream_id = 'near-zulip-community-support'
ORDER BY timestamp DESC
LIMIT 10;
```

### 5.2 Check Watermark

```sql
-- Check last processed message
SELECT
  last_imported_time,
  last_imported_id,
  updated_at
FROM import_watermarks
WHERE stream_id = 'near-zulip-community-support';
```

### 5.3 Manual Trigger (via API)

```bash
# Trigger manual import
curl -X POST http://localhost:3762/api/admin/streams/near-zulip-community-support/import \
  -H "Authorization: Bearer your-admin-token"
```

---

## Troubleshooting

### Issue: "Failed to connect to Zulip API"

**Causes:**
- Invalid bot email or API key
- Bot not subscribed to channel
- Network connectivity issues

**Solutions:**
1. Verify credentials match Zulip settings
2. Check bot is subscribed to the channel
3. Test connection manually:
   ```bash
   curl -u "bot-email:api-key" https://near.zulipchat.com/api/v1/users/me
   ```

### Issue: "No messages being imported"

**Causes:**
- Channel name mismatch
- No new messages in channel
- Bot not subscribed to channel
- `ignoreOldMessages: true` skipping existing messages

**Solutions:**
1. Verify channel name matches exactly (case-sensitive)
2. Send a test message to the channel
3. Check bot subscription list
4. Set `ignoreOldMessages: false` to fetch historical messages

### Issue: "Duplicate messages"

**Causes:**
- Watermark not updating
- Multiple stream configs for same channel

**Solutions:**
1. Check watermark updates in database
2. Ensure only one stream config per channel:
   ```sql
   SELECT * FROM stream_configs WHERE adapter_type = 'zulip';
   ```

### Issue: "Stream disabled after error"

**Causes:**
- API errors (auth, rate limit, etc.)
- Network failures

**Solutions:**
1. Check error logs
2. Fix underlying issue (credentials, network)
3. Re-enable stream:
   ```sql
   UPDATE stream_configs
   SET enabled = true
   WHERE stream_id = 'near-zulip-community-support';
   ```
4. Restart application

---

## Multiple Channels

To monitor multiple Zulip channels, create separate stream configs:

```sql
-- Channel 1: community-support
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled)
VALUES ('near-zulip-community-support', 'zulip', '{"site": "https://near.zulipchat.com", "channel": "community-support"}', true);

-- Channel 2: validators
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled)
VALUES ('near-zulip-validators', 'zulip', '{"site": "https://near.zulipchat.com", "channel": "validators"}', true);
```

**Note:** Each channel gets:
- Independent watermark
- Separate polling schedule
- Isolated error handling

---

## Security Best Practices

1. **Use instance-specific env vars** - Avoid sharing credentials across instances
2. **Rotate API keys regularly** - Generate new keys in Zulip settings
3. **Use read-only bots** - Bots don't need write permissions
4. **Monitor bot activity** - Check Zulip audit logs periodically
5. **Store secrets securely** - Use cloud secret managers (AWS Secrets Manager, etc.)

---

## Advanced Configuration

### Custom Polling Schedule

```sql
-- Poll every 15 minutes
UPDATE stream_configs
SET schedule = '*/15 * * * *'
WHERE stream_id = 'near-zulip-community-support';

-- Poll hourly
UPDATE stream_configs
SET schedule = '0 * * * *'
WHERE stream_id = 'near-zulip-community-support';

-- Disable scheduling (manual only)
UPDATE stream_configs
SET schedule = NULL
WHERE stream_id = 'near-zulip-community-support';
```

### Fetch Historical Messages

```sql
-- Enable historical message import
UPDATE stream_configs
SET config = jsonb_set(config, '{ignoreOldMessages}', 'false')
WHERE stream_id = 'near-zulip-community-support';

-- Increase batch size for faster import
UPDATE stream_configs
SET config = jsonb_set(config, '{batchSize}', '500')
WHERE stream_id = 'near-zulip-community-support';
```

### Reset Watermark

```sql
-- Reset to start from latest messages
DELETE FROM import_watermarks
WHERE stream_id = 'near-zulip-community-support';

-- Or reset to specific message ID
UPDATE import_watermarks
SET last_imported_id = '12345678', last_imported_time = NOW()
WHERE stream_id = 'near-zulip-community-support';
```

---

## Monitoring & Health Checks

### Check Stream Health

```bash
# Get all stream statuses
curl http://localhost:3762/api/admin/streams/health
```

### Check Stream Stats

```sql
-- Messages per stream
SELECT
  stream_id,
  COUNT(*) as total_messages,
  COUNT(CASE WHEN processing_status = 'PENDING' THEN 1 END) as pending,
  COUNT(CASE WHEN processing_status = 'CLASSIFIED' THEN 1 END) as classified,
  MAX(timestamp) as latest_message
FROM unified_messages
GROUP BY stream_id;
```

### Monitor Errors

```sql
-- Check stream config metadata for errors
SELECT
  stream_id,
  enabled,
  metadata->>'disabledReason' as reason,
  metadata->>'lastError' as error,
  updated_at
FROM stream_configs
WHERE enabled = false;
```

---

## FAQ

**Q: Can I use the same bot for multiple channels?**
A: Yes! Create separate stream configs with the same credentials but different channel names.

**Q: How do I pause a stream temporarily?**
A: Set `enabled = false` in the stream config:
```sql
UPDATE stream_configs SET enabled = false WHERE stream_id = 'near-zulip-community-support';
```

**Q: Can I monitor private streams?**
A: Yes, as long as the bot is invited to the private stream.

**Q: What happens if the bot is removed from a channel?**
A: The stream will fail to fetch messages and be automatically disabled. Add the bot back and re-enable the stream.

**Q: How often should I poll?**
A: 30-60 seconds is recommended for active channels. Adjust based on message volume.

**Q: Can I filter messages by topic?**
A: Not currently. The adapter fetches all messages from the channel. Filtering happens during classification.

---

## Support

For issues:
1. Check application logs
2. Review this troubleshooting guide
3. Contact: [Your support contact]

## References

- Zulip API docs: https://zulip.com/api/rest
- Stream adapter spec: `/docs/specs/zulip-stream-adapter.md`
- Multi-stream architecture: `/docs/archive/specs/multi-stream-scanner-phase-1.md`
