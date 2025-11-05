# Spec: Telegram Bot Integration for Message Stream

**Developer:** Wayne
**Created:** 2025-11-04
**Updated:** 2025-11-04
**Status:** Implemented ✅
**Phase:** Multi-Stream Scanner Extension
**Story:** [/docs/stories/multi-stream-message-scanner.md](/docs/stories/multi-stream-message-scanner.md)

**Implementation Complete:** Telegram bot adapter is fully functional in production.
- ✅ Polling and webhook modes
- ✅ Watermark tracking
- ✅ Message normalization with reply chain support
- ✅ IPv4 network fix applied
**Related Specs:**
- [Phase 1 Multi-Stream Scanner](/docs/specs/multi-stream-scanner-phase-1.md)
- [Phase 2 PR Generation](/docs/specs/multi-stream-scanner-phase-2.md)

## Overview

This spec defines the implementation of a Telegram bot adapter for the multi-stream scanner system. Unlike the existing Zulipchat scraper (pull-based API polling), the Telegram bot operates as a **push-based webhook receiver** or **long-polling listener** that ingests messages from configured Telegram channels and groups in real-time.

The Telegram bot adapter integrates seamlessly with the existing watermark tracking, batch processing, conversation grouping, and documentation proposal pipeline.

## Architecture

### Telegram Bot vs Zulipchat Scraper

| Aspect | Zulipchat Scraper | Telegram Bot |
|--------|-------------------|--------------|
| **Method** | Pull-based API polling | Push-based webhooks OR long-polling |
| **Message Access** | Full history via API | Only messages sent after bot joins |
| **Authentication** | Bot email + API key | Bot token |
| **Watermark Use** | Fetch messages since last message ID | Track update_id for deduplication |
| **Channel Discovery** | Manual configuration | Auto-detect when added to groups/channels |
| **Incremental Updates** | Anchor-based pagination | update_id sequential tracking |

### System Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Bot API                          │
│  - Webhooks (production) OR Long-polling (development)      │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │  TelegramBotAdapter     │
        │  - Process updates       │
        │  - Normalize messages    │
        │  - Track watermarks      │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │   UnifiedMessage Store   │
        │   (unified_messages)     │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │   BatchMessageProcessor  │
        │   - Conversation grouping │
        │   - Classification        │
        │   - RAG + Proposals       │
        └──────────────────────────┘
```

## Implementation Components

### 1. TelegramBotAdapter Class

**File:** `server/stream/adapters/telegram-bot-adapter.ts`

```typescript
import { Telegraf, Context } from 'telegraf';
import { Message, Update } from 'telegraf/types';
import { BaseStreamAdapter } from './base-adapter.js';
import { StreamMessage, StreamWatermark } from '../types.js';
import prisma from '../../db.js';

export interface TelegramBotConfig {
  botToken: string;                    // Telegram bot token from @BotFather
  mode: 'webhook' | 'polling';         // Webhook for production, polling for dev
  webhookUrl?: string;                 // Required if mode=webhook
  webhookPath?: string;                // URL path for webhook (default: /telegram-webhook)
  pollingInterval?: number;            // Polling interval in ms (default: 3000)
  allowedChats?: string[];             // Whitelist of chat IDs (optional)
  ignoreOldMessages?: boolean;         // Ignore messages sent before bot started (default: true)
  processCommands?: boolean;           // Process bot commands (default: false)
  saveRawUpdates?: boolean;            // Save full Telegram update JSON (default: true)
}

export class TelegramBotAdapter extends BaseStreamAdapter {
  private bot!: Telegraf;
  private botConfig!: TelegramBotConfig;
  private isRunning = false;

  constructor(streamId: string) {
    super(streamId, 'telegram-bot');
  }

  /**
   * Validate Telegram bot configuration
   */
  validateConfig(config: any): boolean {
    if (!config.botToken || typeof config.botToken !== 'string') {
      console.error('TelegramBotAdapter: botToken is required');
      return false;
    }

    if (!config.mode || !['webhook', 'polling'].includes(config.mode)) {
      console.error('TelegramBotAdapter: mode must be "webhook" or "polling"');
      return false;
    }

    if (config.mode === 'webhook' && !config.webhookUrl) {
      console.error('TelegramBotAdapter: webhookUrl is required for webhook mode');
      return false;
    }

    this.botConfig = {
      mode: config.mode,
      botToken: config.botToken,
      webhookUrl: config.webhookUrl,
      webhookPath: config.webhookPath || '/telegram-webhook',
      pollingInterval: config.pollingInterval || 3000,
      allowedChats: config.allowedChats || [],
      ignoreOldMessages: config.ignoreOldMessages !== false, // default true
      processCommands: config.processCommands || false,
      saveRawUpdates: config.saveRawUpdates !== false, // default true
    };

    return true;
  }

  /**
   * Initialize Telegram bot and set up message handlers
   */
  async initialize(config: any): Promise<void> {
    await super.initialize(config);

    // Create Telegraf bot instance
    this.bot = new Telegraf(this.botConfig.botToken);

    // Set up message handler
    this.bot.on('message', async (ctx) => {
      await this.handleMessage(ctx);
    });

    // Set up channel post handler (for channels where bot is admin)
    this.bot.on('channel_post', async (ctx) => {
      await this.handleMessage(ctx);
    });

    // Optional: Set up commands handler
    if (this.botConfig.processCommands) {
      this.setupCommandHandlers();
    }

    // Start bot based on mode
    if (this.botConfig.mode === 'webhook') {
      await this.startWebhook();
    } else {
      await this.startPolling();
    }

    console.log(`TelegramBotAdapter initialized in ${this.botConfig.mode} mode`);
  }

  /**
   * Start webhook mode (production)
   */
  private async startWebhook(): Promise<void> {
    const { webhookUrl, webhookPath } = this.botConfig;

    // Set webhook
    await this.bot.telegram.setWebhook(`${webhookUrl}${webhookPath}`);
    console.log(`Telegram webhook set to: ${webhookUrl}${webhookPath}`);

    // Webhook will be handled by Express middleware (see routes/admin-routes.ts)
    this.isRunning = true;
  }

  /**
   * Start polling mode (development)
   */
  private async startPolling(): Promise<void> {
    console.log('Starting Telegram bot in polling mode...');

    await this.bot.launch({
      polling: {
        timeout: 30,
        limit: 100,
      },
    });

    this.isRunning = true;
    console.log('Telegram bot polling started');
  }

  /**
   * Handle incoming Telegram message or channel post
   */
  private async handleMessage(ctx: Context): Promise<void> {
    try {
      const message = ctx.message || ctx.channelPost;
      if (!message || !('text' in message)) {
        return; // Ignore non-text messages for now
      }

      const chatId = message.chat.id.toString();

      // Check whitelist if configured
      if (
        this.botConfig.allowedChats &&
        this.botConfig.allowedChats.length > 0 &&
        !this.botConfig.allowedChats.includes(chatId)
      ) {
        console.log(`Ignoring message from non-whitelisted chat: ${chatId}`);
        return;
      }

      // Get watermark to check if we should process this message
      const watermark = await this.getWatermark();

      // Check if this update_id has already been processed
      if (watermark.lastProcessedId) {
        const lastUpdateId = parseInt(watermark.lastProcessedId);
        const currentUpdateId = ctx.update.update_id;

        if (currentUpdateId <= lastUpdateId) {
          console.log(`Skipping already processed update: ${currentUpdateId}`);
          return;
        }
      }

      // Normalize message to StreamMessage format
      const streamMessage = this.normalizeMessage(message, ctx.update);

      // Save to database
      const savedIds = await this.saveMessages([streamMessage]);

      if (savedIds.length > 0) {
        // Update watermark
        await this.updateWatermark(
          streamMessage.timestamp,
          ctx.update.update_id.toString(),
          1
        );

        console.log(
          `Telegram message saved: ${streamMessage.messageId} from ${streamMessage.author} in ${streamMessage.channel}`
        );
      }
    } catch (error) {
      console.error('Error handling Telegram message:', error);
    }
  }

  /**
   * Normalize Telegram message to StreamMessage format
   */
  private normalizeMessage(message: Message.TextMessage, update: Update): StreamMessage {
    const chatType = message.chat.type; // 'private', 'group', 'supergroup', 'channel'
    const chatTitle = 'title' in message.chat ? message.chat.title : 'Direct Message';

    const author = message.from
      ? `${message.from.first_name}${message.from.last_name ? ' ' + message.from.last_name : ''}` +
        (message.from.username ? ` (@${message.from.username})` : '')
      : 'Unknown';

    return {
      messageId: `${message.message_id}`, // Unique within chat
      timestamp: new Date(message.date * 1000),
      author,
      content: message.text,
      channel: chatTitle,
      rawData: this.botConfig.saveRawUpdates ? update : { message_id: message.message_id },
      metadata: {
        chatId: message.chat.id.toString(),
        chatType,
        userId: message.from?.id.toString(),
        username: message.from?.username,
        updateId: update.update_id,
        messageThreadId: 'message_thread_id' in message ? message.message_thread_id : undefined,
        replyToMessageId: message.reply_to_message?.message_id,
      },
    };
  }

  /**
   * Fetch messages (not applicable for push-based bot)
   * This method exists to satisfy StreamAdapter interface
   * Messages are received via handleMessage() instead
   */
  async fetchMessages(watermark?: StreamWatermark): Promise<StreamMessage[]> {
    // Telegram bot is push-based, not pull-based
    // Messages are automatically processed via webhooks/polling
    console.log('TelegramBotAdapter: fetchMessages() is not used (push-based bot)');
    return [];
  }

  /**
   * Set up optional command handlers
   */
  private setupCommandHandlers(): void {
    // /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply('Hello! I am listening to messages in this chat for documentation analysis.');
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      const watermark = await this.getWatermark();
      const stats = await this.getStreamStats();

      await ctx.reply(
        `📊 *Stream Status*\n\n` +
        `Last processed: ${watermark.lastProcessedTime?.toISOString() || 'Never'}\n` +
        `Total messages: ${stats.totalMessages}\n` +
        `Pending processing: ${stats.pendingMessages}`,
        { parse_mode: 'Markdown' }
      );
    });
  }

  /**
   * Get stream statistics
   */
  private async getStreamStats(): Promise<{ totalMessages: number; pendingMessages: number }> {
    const totalMessages = await prisma.unifiedMessage.count({
      where: { streamId: this.streamId },
    });

    const pendingMessages = await prisma.unifiedMessage.count({
      where: {
        streamId: this.streamId,
        processingStatus: 'PENDING',
      },
    });

    return { totalMessages, pendingMessages };
  }

  /**
   * Cleanup bot resources
   */
  async cleanup(): Promise<void> {
    if (this.isRunning) {
      console.log(`Stopping Telegram bot ${this.streamId}...`);

      if (this.botConfig.mode === 'webhook') {
        await this.bot.telegram.deleteWebhook();
      } else {
        this.bot.stop();
      }

      this.isRunning = false;
    }

    await super.cleanup();
  }

  /**
   * Get bot instance for Express webhook integration
   */
  public getBotInstance(): Telegraf {
    return this.bot;
  }
}
```

### 2. Stream Manager Integration

**File:** `server/stream/stream-manager.ts` (modifications)

```typescript
// Add to imports
import { TelegramBotAdapter } from './adapters/telegram-bot-adapter.js';

// Modify createAdapter() method
private createAdapter(
  streamId: string,
  adapterType: string,
  adapterConfig: any
): StreamAdapter | null {
  switch (adapterType) {
    case 'csv':
      return new CsvFileAdapter(streamId);

    case 'telegram-bot':
      return new TelegramBotAdapter(streamId);

    // Future adapters...
    // case 'discord':
    //   return new DiscordAdapter(streamId);

    default:
      return null;
  }
}
```

### 3. Webhook Express Route

**File:** `server/stream/routes/admin-routes.ts` (add webhook endpoint)

```typescript
import { Router } from 'express';
import { TelegramBotAdapter } from '../adapters/telegram-bot-adapter.js';

// ... existing routes ...

/**
 * Telegram webhook endpoint
 * Only used when adapter is in webhook mode
 */
router.post('/telegram-webhook', async (req, res) => {
  try {
    // Find active Telegram bot adapter
    const telegramAdapter = Array.from(streamManager.getAdapters().values()).find(
      (adapter) => adapter.adapterType === 'telegram-bot'
    ) as TelegramBotAdapter | undefined;

    if (!telegramAdapter) {
      return res.status(404).json({ error: 'Telegram bot not configured' });
    }

    // Process update through Telegraf
    const bot = telegramAdapter.getBotInstance();
    await bot.handleUpdate(req.body);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

### 4. Database Schema

**Already exists** in `/prisma/schema.prisma`:

The existing schema supports Telegram bot integration:

```prisma
model ImportWatermark {
  streamId          String    // e.g., "telegram-bot-neardocs"
  streamType        String    // "telegram-bot"
  resourceId        String?   // Chat ID (optional, for multi-chat bots)
  lastImportedTime  DateTime? // Timestamp of last message
  lastImportedId    String?   // update_id from Telegram
  // ...
}

model UnifiedMessage {
  streamId         String    // "telegram-bot-neardocs"
  messageId        String    // "{chat_id}-{message_id}"
  timestamp        DateTime  // Message date
  author           String    // User's full name + username
  content          String    // Message text
  channel          String?   // Chat title
  rawData          Json      // Full Telegram update object
  metadata         Json?     // { chatId, chatType, userId, username, updateId }
  // ...
}
```

## Watermark Behavior

### Update ID Tracking

Telegram provides sequential `update_id` values for each incoming update (message, edit, etc.). The watermark system tracks:

1. **lastImportedId**: Latest `update_id` processed
2. **lastImportedTime**: Timestamp of latest message
3. **resourceId**: Optional chat ID (for multi-chat bots)

### Deduplication Strategy

```typescript
// Watermark check in handleMessage()
const watermark = await this.getWatermark();
if (watermark.lastProcessedId) {
  const lastUpdateId = parseInt(watermark.lastProcessedId);
  const currentUpdateId = ctx.update.update_id;

  if (currentUpdateId <= lastUpdateId) {
    return; // Already processed
  }
}
```

### Multi-Chat Support

For bots monitoring multiple chats, use separate watermarks per chat:

```typescript
// In normalizeMessage(), include chatId in messageId
messageId: `${message.chat.id}-${message.message_id}`

// In getWatermark(), filter by resourceId (chatId)
const watermark = await prisma.importWatermark.findFirst({
  where: {
    streamId: this.streamId,
    resourceId: message.chat.id.toString()
  }
});
```

## Batch Processing Integration

### How Telegram Messages Flow Through Batching

1. **Continuous Import**: Telegram bot receives messages in real-time via webhooks/polling
2. **Immediate Storage**: Messages saved to `unified_messages` table with `processingStatus = PENDING`
3. **Batch Selection**: BatchMessageProcessor selects 24-hour windows from all streams (including Telegram)
4. **Conversation Grouping**: Telegram messages grouped by channel + time proximity
5. **Classification & Proposals**: Same pipeline as other streams

### Example Conversation Grouping

**Input:** Telegram messages from 3 channels
```
#near-general: [10:00, 10:05, 10:12] (3 messages)
#near-dev: [12:00, 12:10] (2 messages)
Direct Message (User A): [14:30] (1 message)
```

**Output:** 3 conversation groups
```
Conversation 1: #near-general, 3 messages (10:00-10:12)
Conversation 2: #near-dev, 2 messages (12:00-12:10)
Conversation 3: Direct Message, 1 message (14:30)
```

**Processing:**
- 3 RAG calls (1 per conversation)
- 3 Proposal generation calls (1 per conversation)
- All Telegram messages processed alongside CSV/Zulipchat messages in same batch

## Configuration

### Environment Variables

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz   # From @BotFather
TELEGRAM_BOT_MODE=polling                                   # webhook | polling
TELEGRAM_WEBHOOK_URL=https://your-domain.com               # Required for webhook mode
TELEGRAM_WEBHOOK_PATH=/telegram-webhook                    # Default: /telegram-webhook
TELEGRAM_POLLING_INTERVAL=3000                             # Polling interval (ms)
TELEGRAM_ALLOWED_CHATS=-1001234567890,-1009876543210      # Comma-separated chat IDs (optional)
TELEGRAM_IGNORE_OLD_MESSAGES=true                          # Ignore messages sent before bot start
TELEGRAM_PROCESS_COMMANDS=true                             # Enable bot commands (/start, /status)
TELEGRAM_SAVE_RAW_UPDATES=true                             # Save full update JSON in rawData
```

### StreamConfig Database Entry

```sql
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled, schedule)
VALUES (
  'telegram-bot-neardocs',
  'telegram-bot',
  '{
    "botToken": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
    "mode": "polling",
    "pollingInterval": 3000,
    "allowedChats": ["-1001234567890"],
    "ignoreOldMessages": true,
    "processCommands": true,
    "saveRawUpdates": true
  }'::jsonb,
  true,
  NULL  -- No cron schedule needed (push-based)
);
```

## Bot Setup Instructions

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` command
3. Choose a name and username for your bot
4. Copy the bot token (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Configure Bot Permissions

```
/setprivacy - Disable (bot can read all messages)
/setjoingroups - Enable (bot can be added to groups)
```

### 3. Add Bot to Channels/Groups

**For Groups:**
1. Add bot as member
2. Grant "Read Messages" permission

**For Channels:**
1. Add bot as administrator
2. Grant "Post Messages" permission (optional, for /status command)

### 4. Get Chat IDs

Use this temporary script to discover chat IDs:

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Send a message to your group/channel, then run the script. Look for `"chat":{"id":-1001234567890}`.

### 5. Configure NearDocsAI

Add to `.env`:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_MODE=polling
TELEGRAM_ALLOWED_CHATS=-1001234567890,-1009876543210
```

### 6. Initialize Stream

```bash
# Register stream via API
POST /api/admin/stream/register
{
  "streamId": "telegram-bot-neardocs",
  "adapterType": "telegram-bot",
  "config": {
    "botToken": "env:TELEGRAM_BOT_TOKEN",
    "mode": "polling",
    "allowedChats": ["-1001234567890"]
  }
}
```

Or insert directly into database:
```sql
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled)
VALUES ('telegram-bot-neardocs', 'telegram-bot', '...'::jsonb, true);
```

## Webhook Setup (Production)

### Using Nginx

```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;

  location /telegram-webhook {
    proxy_pass http://localhost:3000/api/admin/stream/telegram-webhook;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Set Webhook via API

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/telegram-webhook"
```

Or let the adapter set it automatically when initialized with `mode: "webhook"`.

## Testing Strategy

### Unit Tests

**File:** `tests/telegram-bot-adapter.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramBotAdapter } from '../server/stream/adapters/telegram-bot-adapter';

describe('TelegramBotAdapter', () => {
  let adapter: TelegramBotAdapter;

  beforeEach(() => {
    adapter = new TelegramBotAdapter('test-telegram-bot');
  });

  it('should validate correct configuration', () => {
    const config = {
      botToken: '123456:ABC-DEF',
      mode: 'polling',
    };
    expect(adapter.validateConfig(config)).toBe(true);
  });

  it('should reject configuration without bot token', () => {
    const config = { mode: 'polling' };
    expect(adapter.validateConfig(config)).toBe(false);
  });

  it('should normalize Telegram message correctly', () => {
    const mockMessage = {
      message_id: 123,
      date: 1699012345,
      chat: { id: -1001234567890, title: 'Test Group', type: 'supergroup' },
      from: { id: 987654321, first_name: 'John', username: 'johndoe' },
      text: 'How do I configure RPC timeout?',
    };

    const mockUpdate = { update_id: 456, message: mockMessage };

    const normalized = adapter['normalizeMessage'](mockMessage, mockUpdate);

    expect(normalized.messageId).toBe('123');
    expect(normalized.author).toContain('John');
    expect(normalized.content).toBe('How do I configure RPC timeout?');
    expect(normalized.channel).toBe('Test Group');
    expect(normalized.metadata.chatId).toBe('-1001234567890');
  });
});
```

### Integration Tests

**File:** `tests/telegram-bot-integration.test.ts`

```typescript
describe('TelegramBotAdapter Integration', () => {
  it('should save messages to unified_messages table', async () => {
    // Mock Telegram update
    const update = { ... };

    // Process update
    await adapter.handleMessage(mockContext);

    // Verify message saved
    const saved = await prisma.unifiedMessage.findFirst({
      where: { streamId: 'telegram-bot-test' }
    });

    expect(saved).toBeDefined();
    expect(saved?.content).toBe('Test message');
  });

  it('should update watermark after processing', async () => {
    await adapter.handleMessage(mockContext);

    const watermark = await prisma.importWatermark.findFirst({
      where: { streamId: 'telegram-bot-test' }
    });

    expect(watermark?.lastImportedId).toBe('456');
  });
});
```

## Error Handling

### Transient Errors

Following the existing error handling pattern from `multi-stream-phase1`:

1. **Network Errors**: Retry with exponential backoff
2. **Rate Limiting**: Respect Telegram API rate limits (30 msg/sec to same chat)
3. **Invalid Updates**: Log and skip, don't crash

```typescript
private async handleMessage(ctx: Context): Promise<void> {
  try {
    // ... process message ...
  } catch (error) {
    if (this.isTransientError(error)) {
      await this.retryWithBackoff(() => this.handleMessage(ctx));
    } else {
      console.error('Permanent error processing message:', error);
      // Log to error tracking system
    }
  }
}

private isTransientError(error: any): boolean {
  return (
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET' ||
    error.response?.statusCode === 429 || // Rate limit
    error.response?.statusCode >= 500     // Server error
  );
}
```

### Message Processing Failures

Use existing `ProcessingStatus` enum:

```typescript
// On processing failure
await prisma.unifiedMessage.update({
  where: { id: messageId },
  data: {
    processingStatus: 'FAILED',
    failureCount: { increment: 1 },
    lastError: error.message,
  },
});
```

## Monitoring & Metrics

### Metrics to Track

1. **Import Metrics** (same as other adapters):
   - Messages received per hour
   - Update lag (time between Telegram timestamp and processing)
   - Webhook/polling errors

2. **Bot-Specific Metrics**:
   - Messages per chat
   - Active chats count
   - Command usage stats
   - Webhook delivery success rate

3. **Processing Metrics** (shared with other streams):
   - Messages in batch processing queue
   - Conversation grouping efficiency
   - Proposal generation rate

### Health Check Endpoint

```typescript
// GET /api/admin/stream/telegram-bot-neardocs/health
{
  "streamId": "telegram-bot-neardocs",
  "isHealthy": true,
  "mode": "polling",
  "isRunning": true,
  "lastMessage": "2025-11-04T10:30:00Z",
  "totalMessages": 1247,
  "pendingMessages": 23,
  "errorCount": 0,
  "activeChats": ["-1001234567890", "-1009876543210"]
}
```

## Security Considerations

### Bot Token Protection

- Store token in environment variables, NEVER in code
- Use different tokens for dev/staging/prod
- Rotate tokens if compromised

### Chat Access Control

```typescript
// Whitelist enforcement in handleMessage()
if (
  this.botConfig.allowedChats &&
  !this.botConfig.allowedChats.includes(chatId)
) {
  console.warn(`Unauthorized access attempt from chat: ${chatId}`);
  return;
}
```

### Webhook Security

```typescript
// Verify Telegram webhook requests
router.post('/telegram-webhook', async (req, res) => {
  // Optional: Validate secret token
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Process update...
});
```

### Data Privacy

- Store only necessary message data
- Comply with GDPR/data protection laws
- Allow chat administrators to request data deletion

## Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "telegraf": "^4.15.0"
  },
  "devDependencies": {
    "@types/telegraf": "^4.15.0"
  }
}
```

## Migration Path

### Existing Telegram Scraper

If there's an existing Telegram scraper in the codebase:

1. **Phase 1**: Deploy bot adapter alongside existing scraper
2. **Phase 2**: Migrate historical data import to bot adapter
3. **Phase 3**: Deprecate old scraper once bot is stable

### Data Continuity

Ensure watermarks are compatible:

```typescript
// Migration script: convert old scraper watermark to new format
const oldWatermark = await prisma.scrapeMetadata.findFirst({
  where: { source: 'telegram' }
});

if (oldWatermark) {
  await prisma.importWatermark.create({
    data: {
      streamId: 'telegram-bot-neardocs',
      streamType: 'telegram-bot',
      lastImportedTime: oldWatermark.lastScrapeTimestamp,
      lastImportedId: oldWatermark.lastMessageId,
    }
  });
}
```

## Future Enhancements

1. **Multi-Media Support**: Process images, files, voice messages
2. **Thread Support**: Track Telegram Topics/Forums
3. **Edit Tracking**: Detect and process message edits
4. **Admin Commands**: `/approve`, `/reject` for proposal review
5. **Inline Queries**: Respond to inline bot queries
6. **Message Reactions**: Track reactions as engagement signals
7. **User Analytics**: Track most active contributors

## Deliverables

1. ✅ `TelegramBotAdapter` class extending `BaseStreamAdapter`
2. ✅ Webhook endpoint for production mode
3. ✅ Polling support for development mode
4. ✅ Message normalization to `StreamMessage` format
5. ✅ Watermark integration using `update_id`
6. ✅ Multi-chat support with chat whitelisting
7. ✅ Bot commands (`/start`, `/status`)
8. ✅ Configuration via environment variables
9. ✅ Unit and integration tests
10. ✅ Documentation and setup guide

## References

- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Telegraf Framework**: https://telegraf.js.org/
- **Phase 1 Spec**: [/docs/specs/multi-stream-scanner-phase-1.md](/docs/specs/multi-stream-scanner-phase-1.md)
- **Conversation Batching**: [/docs/temp/conversation-based-batch-processing-implementation.md](/docs/temp/conversation-based-batch-processing-implementation.md)
- **Existing Zulipchat Scraper**: `server/scraper/zulipchat.ts`
- **Base Adapter**: `server/stream/adapters/base-adapter.ts`
