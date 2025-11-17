# ZulipChat Stream Analysis & Requirements

**Developer:** Wayne
**Date:** 2025-11-17
**Purpose:** Document current ZulipChat implementation and requirements for multi-tenant stream architecture

---

## Executive Summary

The system has two ZulipChat implementations:
1. **Legacy Scraper** (`server/scraper/zulipchat.ts`) - Pull-based, working implementation
2. **New Stream Architecture** - Multi-tenant, multi-stream framework (partially implemented)

**Current Status:** ZulipChat is NOT integrated into the new multi-stream architecture. Only Telegram and CSV adapters exist.

**Required:** Create a `ZulipBotAdapter` to enable per-tenant ZulipChat streams operating simultaneously with other chat platforms.

---

## Current Architecture

### 1. Multi-Instance Configuration ✅ IMPLEMENTED

**Per-Tenant Configuration:**
```json
// config/near/instance.json
{
  "community": {
    "zulip": {
      "enabled": false,
      "site": "https://near.zulipchat.com",
      "channel": "community-support"
    }
  }
}

// config/conflux/instance.json
{
  "community": {
    "zulip": {
      "enabled": false
    }
  }
}
```

**Database per Tenant:**
- NEAR instance → `neardocs` database (PostgreSQL)
- Conflux instance → `confluxdocs` database (PostgreSQL)
- Each has independent `StreamConfig`, `ImportWatermark`, `UnifiedMessage` tables

### 2. Stream Manager ✅ IMPLEMENTED

**Location:** `server/stream/stream-manager.ts`

**Capabilities:**
- Loads streams from ALL instance databases on startup
- Maps `streamId` → `instanceId` → `database connection`
- Manages concurrent stream execution
- Supports cron scheduling per stream
- Injects instance-specific environment variables (e.g., `NEAR_TELEGRAM_BOT_TOKEN`)

**Current Adapters:**
- ✅ `TelegramBotAdapter` - Push-based (webhook/polling)
- ✅ `CsvFileAdapter` - Pull-based (file import)
- ❌ `ZulipBotAdapter` - **MISSING**

### 3. Legacy ZulipChat Scraper ✅ WORKING

**Location:** `server/scraper/zulipchat.ts`

**Features:**
- Pull-based message fetching
- Incremental scraping with watermark tracking
- Full historical scrape capability
- Stores in `ScrapedMessage` table (old schema)
- Works with environment variables:
  - `ZULIP_BOT_EMAIL`
  - `ZULIP_API_KEY`
  - `ZULIP_SITE` (default: https://near.zulipchat.com)

**Limitations:**
- Hardcoded to single instance (NEAR)
- Not integrated with multi-stream architecture
- Stores to old `ScrapedMessage` table instead of new `UnifiedMessage`
- No per-tenant configuration support

---

## Database Schema

### Multi-Stream Tables (NEW) ✅

```prisma
// Stream configuration per tenant
model StreamConfig {
  streamId    String   @unique  // e.g., "near-zulip-community"
  adapterType String            // "zulip", "telegram", "csv", etc.
  config      Json              // Adapter-specific config
  enabled     Boolean
  schedule    String?           // Cron expression

  watermarks ImportWatermark[]
  messages   UnifiedMessage[]
}

// Watermark tracking per stream
model ImportWatermark {
  streamId          String
  streamType        String    // "zulip", "telegram", etc.
  resourceId        String?   // channel name or file
  lastImportedTime  DateTime?
  lastImportedId    String?   // Last message ID processed
  importComplete    Boolean   // For CSV files

  @@unique([streamId, resourceId])
}

// Unified message storage across all streams
model UnifiedMessage {
  streamId         String
  messageId        String
  timestamp        DateTime
  author           String
  content          String @db.Text
  channel          String
  rawData          Json
  metadata         Json
  processingStatus ProcessingStatus  // PENDING, PROCESSING, CLASSIFIED, etc.

  classification   MessageClassification?

  @@unique([streamId, messageId])
}
```

### Legacy Tables (OLD) ⚠️ Still in use by ZulipScraper

```prisma
model ScrapedMessage {
  messageId        String @unique
  source           MessageSource  // enum: zulipchat, telegram
  channelName      String
  topicName        String?
  senderEmail      String?
  senderName       String?
  content          String @db.Text
  messageTimestamp DateTime
  analyzed         Boolean
}

model ScrapeMetadata {
  source               MessageSource
  channelName          String
  lastMessageId        String?
  lastScrapeTimestamp  DateTime?
  totalMessagesFetched Int
}
```

---

## What Needs to Be Built

### ZulipBotAdapter Requirements

Create `server/stream/adapters/zulip-bot-adapter.ts` following the pattern of `TelegramBotAdapter`.

**Configuration Interface:**
```typescript
export interface ZulipBotConfig {
  email: string;              // Bot email (e.g., bot@zulipchat.com)
  apiKey: string;             // API key from Zulip
  site: string;               // e.g., https://near.zulipchat.com
  channels: string[];         // Channels to monitor
  mode: 'polling' | 'event';  // Polling or event queue
  pollingInterval?: number;   // Default: 30000ms (30s)
  batchSize?: number;         // Messages per fetch (default: 100)
  ignoreOldMessages?: boolean;
}
```

**Key Methods to Implement:**

1. **`validateConfig(config: any): boolean`**
   - Validate email, apiKey, site, channels
   - Ensure site is valid URL

2. **`initialize(config: any): Promise<void>`**
   - Call `super.initialize(config)`
   - Test connection to Zulip API
   - Set up event queue or polling timer
   - Ensure `StreamConfig` and `ImportWatermark` exist in database

3. **`fetchMessages(watermark?: StreamWatermark): Promise<StreamMessage[]>`**
   - Fetch messages from Zulip API
   - Use `/api/v1/messages` endpoint with narrow filter
   - Support incremental fetch using `watermark.lastProcessedId`
   - Normalize to `StreamMessage` format
   - Save to `UnifiedMessage` table (not `ScrapedMessage`)
   - Update watermark after successful fetch

4. **`cleanup(): Promise<void>`**
   - Stop polling timer
   - Deregister event queue
   - Call `super.cleanup()`

**Normalization Example:**
```typescript
private normalizeMessage(zulipMsg: ZulipMessage): StreamMessage {
  return {
    messageId: zulipMsg.id.toString(),
    timestamp: new Date(zulipMsg.timestamp * 1000),
    author: zulipMsg.sender_full_name,
    content: zulipMsg.content,
    channel: typeof zulipMsg.display_recipient === 'string'
      ? zulipMsg.display_recipient
      : 'Direct Message',
    rawData: zulipMsg,
    metadata: {
      topic: zulipMsg.subject,
      senderEmail: zulipMsg.sender_email,
      senderId: zulipMsg.sender_id,
      messageType: zulipMsg.type,
    },
  };
}
```

---

## Multi-Tenant Stream Configuration

### StreamManager Integration

When `StreamManager` initializes, it should:

1. Load all instance configs from `config/*/instance.json`
2. For each instance with `community.zulip.enabled: true`:
   - Get instance-specific database connection
   - Check for existing `StreamConfig` with `streamId` = `{instance}-zulip-{channel}`
   - If not exists, create it:

```typescript
// Example for NEAR instance
const streamId = "near-zulip-community-support";

await instanceDb.streamConfig.create({
  data: {
    streamId: streamId,
    adapterType: "zulip",
    config: {
      email: process.env.NEAR_ZULIP_BOT_EMAIL || process.env.ZULIP_BOT_EMAIL,
      apiKey: process.env.NEAR_ZULIP_API_KEY || process.env.ZULIP_API_KEY,
      site: instanceConfig.community.zulip.site,
      channels: [instanceConfig.community.zulip.channel],
      mode: "polling",
      pollingInterval: 30000,
      batchSize: 100,
    },
    enabled: true,
    schedule: "*/30 * * * *", // Every 30 minutes
  },
});
```

### Environment Variable Pattern

Following the existing pattern in `StreamManager.injectEnvVars()`:

```bash
# Instance-specific (highest priority)
NEAR_ZULIP_BOT_EMAIL=near-bot@zulipchat.com
NEAR_ZULIP_API_KEY=xxxx

CONFLUX_ZULIP_BOT_EMAIL=conflux-bot@zulipchat.com
CONFLUX_ZULIP_API_KEY=yyyy

# Generic fallback (lowest priority)
ZULIP_BOT_EMAIL=generic-bot@zulipchat.com
ZULIP_API_KEY=zzzz
```

**Precedence:** Instance-specific ENV → Generic ENV → Database config

---

## Simultaneous Multi-Stream Operation

### Example Scenario

**Tenant: NEAR**
- Stream 1: `near-zulip-community-support` (Zulip)
- Stream 2: `near-telegram-validators` (Telegram)
- Stream 3: `near-csv-historical-import` (CSV file)

**Tenant: Conflux**
- Stream 1: `conflux-discord-general` (Discord - future)
- Stream 2: `conflux-zulip-dev-chat` (Zulip)

**Concurrent Execution:**
```typescript
// StreamManager runs all streams concurrently
await Promise.allSettled([
  streamManager.runStream('near-zulip-community-support'),
  streamManager.runStream('near-telegram-validators'),
  streamManager.runStream('conflux-zulip-dev-chat'),
]);
```

**Concurrency Limits:**
- Configurable via `MAX_CONCURRENT_STREAMS` (default: 3)
- Prevents resource exhaustion
- Each stream maintains independent watermark

---

## Migration Path

### Phase 1: Create ZulipBotAdapter ✅ Required
1. Copy `telegram-bot-adapter.ts` as template
2. Implement Zulip-specific methods
3. Add Zulip API client calls
4. Test with NEAR instance

### Phase 2: Update StreamManager ✅ Required
1. Add `zulip` case to `createAdapter()` method
2. Add Zulip env var injection to `injectEnvVars()`
3. Add support for multiple channels per stream

### Phase 3: Migrate Legacy Scraper ⚠️ Optional
1. Deprecate `server/scraper/zulipchat.ts`
2. Migrate existing `ScrapedMessage` data to `UnifiedMessage`
3. Remove old scraper routes
4. Update any scripts using old scraper

### Phase 4: Testing ✅ Required
1. Test NEAR Zulip stream in isolation
2. Test NEAR Zulip + Telegram concurrently
3. Test multi-tenant (NEAR + Conflux Zulip)
4. Verify watermark persistence across restarts
5. Test error handling and retry logic

---

## API Endpoints Reference

### Zulip API Endpoints (Used by Adapter)

```bash
# Fetch messages
GET https://near.zulipchat.com/api/v1/messages
  ?anchor={message_id or "newest"}
  &num_before=100
  &num_after=0
  &narrow=[{"operator":"stream","operand":"community-support"}]
  &apply_markdown=false

# Test connection
GET https://near.zulipchat.com/api/v1/users/me

# Register event queue (alternative to polling)
POST https://near.zulipchat.com/api/v1/register
  event_types=["message"]
  narrow=[{"operator":"stream","operand":"community-support"}]

# Get events from queue
GET https://near.zulipchat.com/api/v1/events
  ?queue_id={queue_id}
  &last_event_id={last_event_id}
```

**Authentication:**
```typescript
const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`;
```

---

## Implementation Checklist

### ZulipBotAdapter Implementation
- [ ] Create `server/stream/adapters/zulip-bot-adapter.ts`
- [ ] Implement `ZulipBotConfig` interface
- [ ] Implement `validateConfig()` method
- [ ] Implement `initialize()` method
- [ ] Implement `fetchMessages()` method
- [ ] Implement `normalizeMessage()` helper
- [ ] Implement `cleanup()` method
- [ ] Add Zulip API client methods
- [ ] Add error handling and retry logic
- [ ] Add logging for debugging

### StreamManager Integration
- [ ] Add `zulip` case to `createAdapter()` in `stream-manager.ts`
- [ ] Add Zulip env var injection to `injectEnvVars()`
- [ ] Add support for multi-channel Zulip streams
- [ ] Test instance-specific env var loading

### Database Setup
- [ ] Ensure `StreamConfig` table has all fields
- [ ] Ensure `ImportWatermark` table supports Zulip
- [ ] Ensure `UnifiedMessage` table has proper indexes
- [ ] Add database migration if needed

### Configuration
- [ ] Update `config/near/instance.json` with Zulip config
- [ ] Update `config/conflux/instance.json` with Zulip config
- [ ] Add Zulip env vars to `.env.example`
- [ ] Document Zulip configuration in README

### Testing
- [ ] Unit tests for `ZulipBotAdapter`
- [ ] Integration test: Fetch messages from NEAR Zulip
- [ ] Integration test: Concurrent Zulip + Telegram
- [ ] Integration test: Multi-tenant Zulip streams
- [ ] Test watermark persistence
- [ ] Test error scenarios (invalid credentials, network errors)

### Documentation
- [ ] Update `/docs/admin/` with Zulip setup guide
- [ ] Document Zulip stream configuration
- [ ] Add Zulip to adapter comparison table
- [ ] Update architecture diagrams

---

## Existing Zulip Implementation Reference

### ZulipChat Scraper Behavior (Legacy)

**Incremental Scraping:**
- Uses `lastMessageId` as anchor
- Fetches messages with `num_after` to get newer messages
- Filters out anchor message itself
- Updates watermark with max message ID

**Full Scraping:**
- Starts from "newest"
- Fetches batches backward through history
- Stops when `messages.length < batchSize`
- Handles pagination with anchor

**Watermark Tracking:**
- Stores `lastMessageId` (Zulip message ID, sequential integer)
- Stores `lastScrapeTimestamp` (for reference)
- Always advances to max message ID seen

**Error Handling:**
- Throws on API errors
- Checks response status
- Validates `result === "success"`

---

## Recommendations

1. **Start with Polling Mode**
   - Simpler to implement
   - Works reliably with existing StreamManager scheduling
   - Event queue can be added later for real-time needs

2. **Reuse Legacy Scraper Logic**
   - Copy incremental/full scrape logic from `zulipchat.ts`
   - Adapt to new `StreamMessage` format
   - Leverage existing Zulip API knowledge

3. **Support Multiple Channels**
   - Allow config to specify array of channels
   - Create separate `ImportWatermark` per channel
   - Use `resourceId` field for channel name

4. **Environment Variable Strategy**
   - Follow pattern: `{INSTANCE}_ZULIP_{VAR}`
   - Support both instance-specific and generic vars
   - Document in `.env.example`

5. **Migration Strategy**
   - Keep legacy scraper temporarily for backward compatibility
   - Run new adapter alongside old scraper during testing
   - Migrate to new system after validation

---

## Questions for Wayne

1. Should we support both polling and event queue modes, or just polling initially?
2. Do you want to migrate existing `ScrapedMessage` data to `UnifiedMessage`?
3. Should the adapter support multiple channels in a single stream, or one stream per channel?
4. Do you want automatic stream creation from instance config, or manual via API/database?
5. Should we deprecate the old ZulipChat scraper immediately or run both temporarily?

---

## Next Steps

1. Review this analysis
2. Answer questions above
3. Create feature story for ZulipBotAdapter
4. Create technical spec for implementation
5. Implement adapter following TelegramBotAdapter pattern
6. Test with NEAR instance
7. Deploy and monitor

