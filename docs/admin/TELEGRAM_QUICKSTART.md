# Telegram Bot Quick Start

**Your bot is ready to configure!**

Bot Token: `YOUR_TELEGRAM_BOT_TOKEN` (get from @BotFather)

## Step 1: Register Stream in Database

```bash
# From project root
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -p 5433 -U docsai -d docsai -f scripts/permanent/setup-telegram-bot.sql
```

This creates the `telegram-bot` stream configuration.

## Step 2: Add Bot to Telegram Group/Channel

1. **Find your bot** on Telegram (ask @BotFather what your bot username is with `/mybots`)
2. **Add bot to your group/channel**:
   - For groups: Add as member
   - For channels: Add as administrator
3. **Send a test message** in the group/channel

## Step 3: Get Chat ID (Optional - for whitelist)

```bash
# Send a message in your group first, then run:
curl https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/getUpdates

# Look for "chat":{"id":-1001234567890}
# Copy the chat ID (including the minus sign)
```

**To enable whitelist** (recommended for production):
1. Edit `.env` and add your chat ID:
   ```bash
   TELEGRAM_ALLOWED_CHATS=-1001234567890
   ```
2. Restart the server

## Step 4: Start Server

```bash
npm run dev
```

**Look for these log messages:**
```
StreamManager initialized with config: {...}
Registering stream: telegram-bot (telegram-bot)
TelegramBotAdapter initialized in polling mode
Telegram bot polling started
```

## Step 5: Test Message Reception

1. **Send a message** in your Telegram group/channel
2. **Check logs** for confirmation:
   ```
   Telegram message saved: -1001234567890-123 from Wayne (@username) in Your Group Name
   ```

3. **Verify in database**:
   ```bash
   PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -p 5433 -U docsai -d docsai -c "SELECT id, author, channel, LEFT(content, 50) as content FROM unified_messages WHERE stream_id = 'telegram-bot' ORDER BY timestamp DESC LIMIT 5;"
   ```

## Step 6: Process Messages

Messages are automatically saved but need batch processing:

```bash
# Via API (recommended)
curl -X POST http://localhost:3762/api/admin/stream/process-batch \
  -H "Content-Type: application/json"

# Or via admin dashboard:
# http://localhost:3762/admin → Click "Process Batch"
```

**Expected output:**
```json
{
  "message": "Batch processing complete",
  "messagesProcessed": 10
}
```

## Step 7: View Results

```bash
# Check processing stats
curl http://localhost:3762/api/admin/stream/stats

# View messages with documentation value
curl http://localhost:3762/api/admin/stream/messages?docValue=true

# View proposals
curl http://localhost:3762/api/admin/stream/proposals
```

## Bot Commands

If someone sends commands in the group:

- `/start` → "Hello! I am listening to messages in this chat for documentation analysis."
- `/status` → Shows stream statistics

## Troubleshooting

### Bot not receiving messages?

1. **Check bot permissions:**
   ```bash
   curl https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/getMe
   ```

2. **Check privacy settings** with @BotFather:
   ```
   /mybots → Select your bot → Bot Settings → Group Privacy → Turn OFF
   ```

3. **Verify stream is enabled:**
   ```sql
   SELECT * FROM stream_configs WHERE stream_id = 'telegram-bot';
   ```

### Messages saved but not processed?

Check processing watermark:
```sql
SELECT * FROM processing_watermark;
```

The watermark should be before your message timestamps. If it's too far ahead, reset it:
```sql
UPDATE processing_watermark SET watermark_time = NOW() - INTERVAL '7 days';
```

Then run batch processing again.

## Next Steps

1. **Monitor for 24 hours** - Let messages accumulate
2. **Run first batch** - `POST /api/admin/stream/process-batch`
3. **Review proposals** - Check admin dashboard
4. **Approve good updates** - Click approve on valuable proposals
5. **Add more channels** - Repeat Step 2 for other groups

## Configuration

Current settings from `.env`:
- **Mode:** `polling` (good for development)
- **Commands:** Enabled (`/start`, `/status`)
- **Whitelist:** None (accepts messages from all chats)
- **Raw data:** Saved (full Telegram updates stored)

**For production**, consider:
1. Switch to `webhook` mode
2. Enable `TELEGRAM_ALLOWED_CHATS` whitelist
3. Set up HTTPS domain
4. Configure rate limiting

See full docs: `/docs/admin/telegram-bot-setup.md`
