# Telegram Bot Setup Guide

**Last Updated:** 2025-11-04 by Wayne

This guide explains how to set up and configure the Telegram bot integration for the DocsAI multi-stream scanner system.

## Overview

The Telegram bot adapter allows DocsAI to ingest messages from Telegram channels and groups in real-time. Messages are processed through the same batch analysis pipeline as other message sources (CSV, Zulipchat), with conversation grouping, RAG retrieval, and documentation proposal generation.

## Architecture

- **Type:** Push-based (webhooks or long-polling)
- **Watermarking:** Uses Telegram's sequential `update_id` for deduplication
- **Batch Processing:** Messages saved to `unified_messages` table and processed in 24-hour batches
- **Conversation Grouping:** Messages grouped by channel + time proximity (15-minute windows)

## Prerequisites

1. Node.js project with DocsAI installed
2. PostgreSQL database with Prisma schema
3. Telegram account
4. (For webhook mode) HTTPS domain with valid SSL certificate

## Step 1: Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow prompts to choose a bot name and username
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Configure bot settings:
   ```
   /setprivacy - Disable (bot can read all group messages)
   /setjoingroups - Enable (bot can be added to groups)
   ```

## Step 2: Add Bot to Channels/Groups

### For Groups:
1. Add your bot as a member to the group
2. Ensure bot has "Read Messages" permission

### For Channels:
1. Add bot as administrator
2. Grant "Post Messages" permission (optional, for bot commands)

## Step 3: Get Chat IDs

You need the chat ID to configure the bot's whitelist.

**Method 1: Use API**
```bash
# Send a message to your group/channel first
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates

# Look for "chat":{"id":-1001234567890}
```

**Method 2: Forward message to @userinfobot**
Forward any message from the channel to [@userinfobot](https://t.me/userinfobot) to see the chat ID.

## Step 4: Configure Environment Variables

Add to your `.env` file:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_MODE=polling                                   # or 'webhook'
TELEGRAM_WEBHOOK_URL=https://your-domain.com               # Required for webhook mode
TELEGRAM_ALLOWED_CHATS=-1001234567890,-1009876543210      # Comma-separated chat IDs
```

## Step 5: Register Stream in Database

**Option A: Via Admin API**

```bash
POST /api/admin/stream/register
Content-Type: application/json

{
  "streamId": "telegram-bot",
  "adapterType": "telegram-bot",
  "config": {
    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "mode": "polling",
    "allowedChats": ["-1001234567890"],
    "processCommands": true,
    "saveRawUpdates": true
  }
}
```

**Option B: Direct Database Insert**

```sql
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled)
VALUES (
  'telegram-bot',
  'telegram-bot',
  '{
    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "mode": "polling",
    "allowedChats": ["-1001234567890"],
    "processCommands": true,
    "saveRawUpdates": true
  }'::jsonb,
  true
);
```

## Step 6: Start Server

```bash
npm run dev
```

The bot will automatically start when the StreamManager initializes. Look for:
```
TelegramBotAdapter initialized in polling mode
Telegram bot polling started
```

## Step 7: Test the Bot

1. Send a message in your configured channel/group
2. Check logs to confirm message was received:
   ```
   Telegram message saved: -1001234567890-123 from John Doe (@johndoe) in Test Group
   ```
3. Verify message in database:
   ```sql
   SELECT * FROM unified_messages WHERE stream_id = 'telegram-bot';
   ```

## Configuration Options

### Required Settings

| Field | Type | Description |
|-------|------|-------------|
| `botToken` | string | Bot token from @BotFather |
| `mode` | `'polling'` \| `'webhook'` | Operation mode |

### Optional Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `webhookUrl` | string | - | Required if mode=webhook |
| `webhookPath` | string | `/telegram-webhook` | Webhook endpoint path |
| `pollingInterval` | number | 3000 | Polling interval (ms) |
| `allowedChats` | string[] | `[]` | Whitelist of chat IDs |
| `ignoreOldMessages` | boolean | `true` | Ignore messages sent before bot start |
| `processCommands` | boolean | `false` | Enable bot commands |
| `saveRawUpdates` | boolean | `true` | Save full update JSON |

## Bot Commands

If `processCommands: true`:

- `/start` - Welcome message
- `/status` - Show stream statistics

Example:
```
User: /status
Bot: 📊 Stream Status

Last processed: 2025-11-04T10:30:00Z
Total messages: 1247
Pending processing: 23
```

## Webhook Setup (Production)

### 1. Configure Nginx

```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location /telegram-webhook {
    proxy_pass http://localhost:3000/api/admin/stream/telegram-webhook;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 2. Update Environment

```bash
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-domain.com
```

### 3. Set Webhook

The adapter automatically sets the webhook on initialization, or manually:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/telegram-webhook"
```

### 4. Verify Webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## Message Flow

1. **Real-time Import:**
   - Telegram sends update → Bot receives via webhook/polling
   - Deduplication check using `update_id`
   - Normalize to `StreamMessage` format
   - Save to `unified_messages` table (`processingStatus = PENDING`)
   - Update import watermark

2. **Batch Processing** (runs periodically):
   - Select 24-hour window of PENDING messages
   - Group by conversation (channel + time proximity)
   - Classify conversations (1 LLM call per batch)
   - Retrieve RAG docs (1 call per conversation)
   - Generate proposals (1 call per conversation)

3. **Admin Review:**
   - View proposals in admin dashboard
   - Approve/reject documentation updates

## Monitoring

### Check Bot Status

```bash
GET /api/admin/stream/streams

# Response:
[
  {
    "streamId": "telegram-bot",
    "adapterType": "telegram-bot",
    "enabled": true,
    "watermarks": [{
      "lastImportedTime": "2025-11-04T10:30:00Z",
      "lastImportedId": "456"
    }],
    "_count": {
      "messages": 1247
    }
  }
]
```

### View Messages

```bash
GET /api/admin/stream/messages?streamId=telegram-bot
```

### Check Processing Status

```bash
GET /api/admin/stream/stats

# Response:
{
  "total_messages": 1500,
  "processed": 1200,
  "queued": 300,
  "with_suggestions": 150,
  "proposals": {
    "total": 85,
    "approved": 30,
    "pending": 55
  }
}
```

## Troubleshooting

### Bot Not Receiving Messages

1. **Check bot is running:**
   ```bash
   # Look for "Telegram bot polling started" in logs
   grep "Telegram bot" logs/app.log
   ```

2. **Verify chat whitelist:**
   ```sql
   SELECT config->'allowedChats' FROM stream_configs WHERE stream_id = 'telegram-bot';
   ```

3. **Check bot permissions:**
   - Group: Bot must have "Read Messages" permission
   - Channel: Bot must be admin

4. **Test API connection:**
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getMe"
   ```

### Messages Not Being Processed

1. **Check processing status:**
   ```sql
   SELECT processing_status, COUNT(*)
   FROM unified_messages
   WHERE stream_id = 'telegram-bot'
   GROUP BY processing_status;
   ```

2. **Trigger batch processing manually:**
   ```bash
   POST /api/admin/stream/process-batch
   ```

3. **Check processing watermark:**
   ```sql
   SELECT * FROM processing_watermark;
   ```

### Webhook Issues

1. **Verify webhook is set:**
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```

2. **Check SSL certificate:**
   ```bash
   curl https://your-domain.com/telegram-webhook
   ```

3. **View webhook logs:**
   ```bash
   tail -f logs/app.log | grep "Telegram webhook"
   ```

## Security Best Practices

1. **Never commit bot token** - Use environment variables only
2. **Use whitelist** - Restrict bot to specific chats via `allowedChats`
3. **Rotate tokens** - Change bot token if compromised
4. **Use HTTPS** - Required for webhook mode
5. **Validate webhooks** - Verify requests from Telegram's IP ranges
6. **Monitor usage** - Check for unexpected message volumes

## Data Privacy

- Messages are stored in `unified_messages` table
- Raw Telegram updates saved if `saveRawUpdates: true`
- User IDs and usernames included in metadata
- Comply with GDPR/data protection laws
- Provide data deletion capability for chat administrators

## Next Steps

1. **Monitor first batch processing:**
   ```bash
   POST /api/admin/stream/process-batch
   ```

2. **Review proposals in admin dashboard:**
   ```
   http://localhost:3000/admin/analysis
   ```

3. **Add more channels/groups** - Update `allowedChats` config

4. **Configure scheduling** - Set up cron for automatic batch processing

5. **Switch to webhook mode** - For production deployment

## References

- **Spec:** [/docs/specs/telegram-bot-integration.md](/docs/specs/telegram-bot-integration.md)
- **Phase 1 Spec:** [/docs/specs/multi-stream-scanner-phase-1.md](/docs/specs/multi-stream-scanner-phase-1.md)
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Telegraf Docs:** https://telegraf.js.org/
