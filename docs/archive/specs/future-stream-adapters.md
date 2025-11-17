# Spec: Future Stream Adapters

**Author:** Wayne
**Date:** 2025-11-04
**Status:** Draft
**Priority:** Low (Implement when required)
**Related Story:** [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)

## Overview

This specification documents stream adapters that have been planned but not yet implemented. These adapters will extend the multi-stream message scanner system to support additional communication platforms. Implementation is deferred until business requirements necessitate these integrations.

## Adapter Framework

All adapters must implement the `BaseStreamAdapter` interface defined in `server/stream/adapters/base-adapter.ts`:

```typescript
abstract class BaseStreamAdapter {
  abstract validateConfig(config: any): boolean;
  abstract initialize(config: any): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract getWatermark(): Promise<StreamWatermark>;
  abstract updateWatermark(watermark: StreamWatermark): Promise<void>;
}
```

## Planned Adapters

### 1. Discord Adapter

**Purpose:** Ingest messages from Discord servers

**Configuration:**
```typescript
interface DiscordAdapterConfig {
  botToken: string;              // Discord bot token
  guildId: string;               // Server ID
  channels: string[];            // Channel IDs to monitor
  mode: 'webhook' | 'gateway';   // Gateway for real-time, webhook for push
  ignoreOldMessages?: boolean;   // Default: true
}
```

**Key Features:**
- Connect to Discord Gateway API
- Monitor specific channels
- Handle threads and replies
- Capture reactions and attachments metadata
- Support bot commands for control

**Watermark Strategy:**
- `lastProcessedId`: Discord message ID (Snowflake)
- `lastProcessedTime`: Message timestamp

**Implementation Notes:**
- Use `discord.js` library
- Handle rate limiting (50 requests per second)
- Support slash commands for admin control

---

### 2. Slack Adapter

**Purpose:** Ingest messages from Slack workspaces

**Configuration:**
```typescript
interface SlackAdapterConfig {
  botToken: string;              // Slack bot token (xoxb-)
  workspaceId: string;           // Workspace ID
  channels: string[];            // Channel IDs to monitor
  mode: 'polling' | 'events';    // Events API for real-time
  pollingInterval?: number;      // If using polling (default: 5000ms)
}
```

**Key Features:**
- Connect to Slack Events API or polling
- Monitor public and private channels (if bot is invited)
- Capture thread replies
- Handle mentions and reactions
- Support slash commands

**Watermark Strategy:**
- `lastProcessedId`: Slack message timestamp (ts)
- `lastProcessedTime`: Converted from ts

**Implementation Notes:**
- Use `@slack/web-api` and `@slack/events-api` libraries
- Handle OAuth scopes: `channels:history`, `groups:history`, `im:history`
- Respect Slack API rate limits (Tier 2: 20+ per minute)

---

### 3. Generic Webhook Adapter

**Purpose:** Accept messages pushed via HTTP webhooks from any source

**Configuration:**
```typescript
interface WebhookAdapterConfig {
  webhookPath: string;           // URL path to listen on (e.g., /webhook/custom)
  secretToken?: string;          // HMAC validation token
  signatureHeader?: string;      // Header containing signature
  messageFormat: 'json' | 'form'; // Request body format
  fieldMapping: {                // Map webhook fields to StreamMessage
    timestamp: string;           // JSONPath or field name
    author: string;
    content: string;
    channel?: string;
    messageId?: string;
  };
}
```

**Key Features:**
- Express middleware for webhook endpoint
- HMAC signature validation (optional)
- Flexible field mapping
- JSON or form-encoded body support
- Idempotency using messageId

**Watermark Strategy:**
- `lastProcessedId`: Extracted messageId from webhook payload
- `lastProcessedTime`: Current time

**Implementation Notes:**
- No polling, purely push-based
- Returns 200 OK immediately, processes async
- Stores raw payload for debugging

---

### 4. Microsoft Teams Adapter

**Purpose:** Ingest messages from Microsoft Teams channels

**Configuration:**
```typescript
interface TeamsAdapterConfig {
  clientId: string;              // Azure AD app client ID
  clientSecret: string;          // Azure AD app secret
  tenantId: string;              // Azure AD tenant ID
  teamId: string;                // Team ID
  channels: string[];            // Channel IDs to monitor
  mode: 'polling' | 'webhook';   // Webhook requires public URL
}
```

**Key Features:**
- Connect via Microsoft Graph API
- Monitor team channels
- Handle threaded conversations
- Capture @mentions
- Support adaptive cards metadata

**Watermark Strategy:**
- `lastProcessedId`: Teams message ID
- `lastProcessedTime`: Message createdDateTime

**Implementation Notes:**
- Use `@microsoft/microsoft-graph-client`
- Requires Azure AD app registration
- Rate limits: 10,000 requests per 10 minutes
- Webhook subscription expires after 3 days

---

### 5. ZulipChat Adapter (Refactored)

**Status:** Legacy scraper exists, needs refactoring to BaseStreamAdapter

**Purpose:** Replace existing ZulipChat scraper with standardized adapter

**Current Implementation:**
- Location: `server/scraper/zulipchat.ts` (legacy)
- Issues: Not using BaseStreamAdapter interface, separate watermark system

**Refactoring Tasks:**
- [ ] Create `server/stream/adapters/zulipchat-adapter.ts`
- [ ] Implement BaseStreamAdapter interface
- [ ] Migrate existing logic to new adapter
- [ ] Use unified watermark system
- [ ] Add to stream manager registry
- [ ] Deprecate old scraper

**Configuration:**
```typescript
interface ZulipChatAdapterConfig {
  zulipUrl: string;              // Zulip server URL
  email: string;                 // Bot email
  apiKey: string;                // Bot API key
  streams: string[];             // Streams to monitor
  pollingInterval?: number;      // Default: 5000ms
}
```

---

## Implementation Priority

**When to implement each adapter:**

1. **Discord Adapter** - Implement if/when business requires Discord community monitoring
2. **Slack Adapter** - Implement if/when business uses Slack for customer support
3. **Webhook Adapter** - Implement when custom integrations are needed
4. **Teams Adapter** - Implement if/when enterprise clients request Teams integration
5. **ZulipChat Refactoring** - Implement if the legacy scraper causes maintenance issues

## Database Schema (No changes required)

The existing schema supports all adapters:

```sql
-- stream_configs table (already exists)
-- Stores adapter configuration per stream

-- import_watermarks table (already exists)
-- Tracks watermarks per stream/channel

-- unified_messages table (already exists)
-- Stores normalized messages from all sources
```

## Testing Strategy

For each adapter:

### Unit Tests
- Configuration validation
- Message normalization
- Watermark handling
- Error scenarios

### Integration Tests
- End-to-end message ingestion
- Watermark persistence
- Reconnection handling
- Rate limit compliance

### Manual Testing
- Create test bot on platform
- Send test messages
- Verify ingestion and watermark tracking
- Test with various message types (text, links, mentions)

## Security Considerations

- **Credentials:** Store all tokens/secrets in environment variables or secure vault
- **Validation:** Verify webhook signatures where supported
- **Rate Limiting:** Respect platform API limits to avoid bans
- **Data Privacy:** Only ingest public channels or channels where bot is explicitly invited
- **Audit Logging:** Log all adapter operations for security review

## References

- **Base Adapter:** `server/stream/adapters/base-adapter.ts`
- **Telegram Adapter:** `server/stream/adapters/telegram-bot-adapter.ts` (reference implementation)
- **CSV Adapter:** `server/stream/adapters/csv-file-adapter.ts` (reference for file-based)
- **Story:** [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)

## Approval

- [ ] Story reviewed and approved by Wayne
- [ ] Implementation priority confirmed
- [ ] Defer until business requirements identified
