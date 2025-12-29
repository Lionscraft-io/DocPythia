# Spec: Zulip Stream Adapter

**Developer:** Wayne
**Date:** 2025-11-17
**Status:** Draft
**Related Story:** N/A (Infrastructure enhancement)

---

## 1. Overview

Implement `ZulipBotAdapter` to enable per-tenant Zulip stream ingestion within the multi-stream architecture. This adapter will use pull-based polling (like TelegramBotAdapter polling mode) to fetch messages from Zulip channels and store them in the unified message pipeline.

**Goals:**
- Support one Zulip channel per tenant instance
- Use predictable per-tenant authentication configuration
- Integrate seamlessly with existing StreamManager
- Enable concurrent operation with other stream types (Telegram, CSV)
- Replace legacy `server/scraper/zulipchat.ts` implementation

---

## 2. Technical Design

### 2.1 Adapter Architecture

**Location:** `server/stream/adapters/zulip-bot-adapter.ts`

**Pattern:** Extends `BaseStreamAdapter`, follows `TelegramBotAdapter` polling pattern

**Configuration Schema:**
```typescript
export interface ZulipBotConfig {
  email: string;              // Bot email for Zulip authentication
  apiKey: string;             // API key from Zulip settings
  site: string;               // Zulip site URL (e.g., https://example.zulipchat.com)
  channel: string;            // Single channel/stream name to monitor
  pollingInterval?: number;   // Default: 30000ms (30 seconds)
  batchSize?: number;         // Messages per fetch (default: 100)
  ignoreOldMessages?: boolean; // Ignore messages before adapter initialization
}
```

### 2.2 Instance Configuration

Per-tenant configuration in `config/{instance}/instance.json`:

```json
{
  "community": {
    "zulip": {
      "enabled": true,
      "site": "https://example.zulipchat.com",
      "channel": "community-support"
    }
  }
}
```

### 2.3 Environment Variables

**Per-Tenant Pattern:**
```bash
# Project A instance
PROJECTA_ZULIP_BOT_EMAIL=projecta-bot@zulipchat.com
PROJECTA_ZULIP_API_KEY=abc123xyz

# Project B instance
PROJECTB_ZULIP_BOT_EMAIL=projectb-bot@zulipchat.com
PROJECTB_ZULIP_API_KEY=def456uvw

# Generic fallback
ZULIP_BOT_EMAIL=generic-bot@zulipchat.com
ZULIP_API_KEY=ghi789rst
```

**Precedence:** `{INSTANCE}_ZULIP_{VAR}` → `ZULIP_{VAR}` → database config

### 2.4 Database Schema

**Uses existing multi-stream tables:**

```prisma
// Stream configuration (one per tenant Zulip channel)
model StreamConfig {
  streamId: "projecta-zulip-community-support"
  adapterType: "zulip"
  config: { email, apiKey, site, channel, ... }
  enabled: true
  schedule: "*/30 * * * *"  // Every 30 minutes
}

// Watermark (one per stream)
model ImportWatermark {
  streamId: "projecta-zulip-community-support"
  streamType: "zulip"
  resourceId: null  // Not used for single-channel adapter
  lastImportedTime: DateTime
  lastImportedId: "12345678"  // Last Zulip message ID
}

// Messages stored in unified format
model UnifiedMessage {
  streamId: "projecta-zulip-community-support"
  messageId: "12345678"  // Zulip message ID
  timestamp: DateTime
  author: "John Doe"
  content: "Message content..."
  channel: "community-support"
  rawData: { ...zulipMessage }
  metadata: { topic, senderEmail, senderId }
}
```

---

## 3. Implementation

### 3.1 ZulipBotAdapter Class

```typescript
/**
 * Zulip Stream Adapter
 * Pull-based polling adapter for Zulip channels
 * Author: Wayne
 * Date: 2025-11-17
 */

import { BaseStreamAdapter } from './base-adapter.js';
import { StreamMessage, StreamWatermark } from '../types.js';
import { PrismaClient } from '@prisma/client';

export interface ZulipBotConfig {
  email: string;
  apiKey: string;
  site: string;
  channel: string;
  pollingInterval?: number;
  batchSize?: number;
  ignoreOldMessages?: boolean;
}

export interface ZulipMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  sender_email: string;
  timestamp: number;
  content: string;
  display_recipient: string | Array<{ id: number; email: string; full_name: string }>;
  subject: string;
  type: "stream" | "private";
}

export interface ZulipMessagesResponse {
  messages: ZulipMessage[];
  result: string;
  msg: string;
}

export class ZulipBotAdapter extends BaseStreamAdapter {
  private botConfig!: ZulipBotConfig;
  private pollingTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(streamId: string, db: PrismaClient) {
    super(streamId, 'zulip', db);
  }

  /**
   * Validate Zulip bot configuration
   */
  validateConfig(config: any): boolean {
    if (!config.email || typeof config.email !== 'string') {
      console.error('ZulipBotAdapter: email is required');
      return false;
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      console.error('ZulipBotAdapter: apiKey is required');
      return false;
    }

    if (!config.site || typeof config.site !== 'string') {
      console.error('ZulipBotAdapter: site is required');
      return false;
    }

    if (!config.channel || typeof config.channel !== 'string') {
      console.error('ZulipBotAdapter: channel is required');
      return false;
    }

    // Validate site URL
    try {
      new URL(config.site);
    } catch {
      console.error('ZulipBotAdapter: site must be a valid URL');
      return false;
    }

    this.botConfig = {
      email: config.email,
      apiKey: config.apiKey,
      site: config.site,
      channel: config.channel,
      pollingInterval: config.pollingInterval || 30000,
      batchSize: config.batchSize || 100,
      ignoreOldMessages: config.ignoreOldMessages !== false,
    };

    return true;
  }

  /**
   * Initialize Zulip adapter and test connection
   */
  async initialize(config: any): Promise<void> {
    await super.initialize(config);

    // Test connection
    const connectionOk = await this.testConnection();
    if (!connectionOk) {
      throw new Error('Failed to connect to Zulip API. Check credentials.');
    }

    console.log(`ZulipBotAdapter initialized for channel: ${this.botConfig.channel}`);
  }

  /**
   * Fetch messages from Zulip API using watermark
   */
  async fetchMessages(watermark?: StreamWatermark): Promise<StreamMessage[]> {
    this.ensureInitialized();

    const { channel, batchSize } = this.botConfig;

    let anchor: string | number = 'newest';
    let numBefore = batchSize || 100;
    let numAfter = 0;

    // Incremental fetch if watermark exists
    if (watermark?.lastProcessedId) {
      anchor = watermark.lastProcessedId;
      numBefore = 0;
      numAfter = batchSize || 100;
    }

    // Build narrow filter for specific stream/channel
    const narrow = [{ operator: 'stream', operand: channel }];

    const params = new URLSearchParams({
      anchor: anchor.toString(),
      num_before: numBefore.toString(),
      num_after: numAfter.toString(),
      narrow: JSON.stringify(narrow),
      apply_markdown: 'false',
    });

    const url = `${this.botConfig.site}/api/v1/messages?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zulip API error (${response.status}): ${errorText}`);
    }

    const data: ZulipMessagesResponse = await response.json();

    if (data.result !== 'success') {
      throw new Error(`Zulip API error: ${data.msg}`);
    }

    let messages = data.messages;

    // Filter out the anchor message if doing incremental fetch
    if (watermark?.lastProcessedId) {
      messages = messages.filter(msg => msg.id.toString() !== watermark.lastProcessedId);
    }

    // Normalize to StreamMessage format
    const streamMessages = messages.map(msg => this.normalizeMessage(msg));

    // Save messages to database
    if (streamMessages.length > 0) {
      await this.saveMessages(streamMessages);

      // Update watermark
      const lastMessage = streamMessages[streamMessages.length - 1];
      await this.updateWatermark(
        lastMessage.timestamp,
        lastMessage.messageId,
        streamMessages.length
      );
    }

    console.log(`Fetched ${streamMessages.length} messages from Zulip channel: ${channel}`);

    return streamMessages;
  }

  /**
   * Normalize Zulip message to StreamMessage format
   */
  private normalizeMessage(message: ZulipMessage): StreamMessage {
    const channelName = typeof message.display_recipient === 'string'
      ? message.display_recipient
      : 'Direct Message';

    return {
      messageId: message.id.toString(),
      timestamp: new Date(message.timestamp * 1000),
      author: message.sender_full_name,
      content: message.content,
      channel: channelName,
      rawData: message,
      metadata: {
        topic: message.subject,
        senderEmail: message.sender_email,
        senderId: message.sender_id.toString(),
        messageType: message.type,
      },
    };
  }

  /**
   * Get Basic Auth header for Zulip API
   */
  private getAuthHeader(): string {
    const credentials = `${this.botConfig.email}:${this.botConfig.apiKey}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Test connection to Zulip API
   */
  private async testConnection(): Promise<boolean> {
    try {
      const url = `${this.botConfig.site}/api/v1/users/me`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        console.error(`Zulip connection test failed: ${response.status}`);
        return false;
      }

      const data = await response.json();
      console.log(`Zulip connection successful. Bot: ${data.email}`);
      return true;
    } catch (error) {
      console.error('Zulip connection test failed:', error);
      return false;
    }
  }

  /**
   * Cleanup adapter resources
   */
  async cleanup(): Promise<void> {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }

    this.isRunning = false;
    await super.cleanup();
  }
}
```

### 3.2 StreamManager Integration

**Add to `server/stream/stream-manager.ts`:**

```typescript
// Import
import { ZulipBotAdapter } from './adapters/zulip-bot-adapter.js';

// In createAdapter() method
private createAdapter(
  streamId: string,
  adapterType: string,
  adapterConfig: any,
  instanceId: string,
  instanceDb: PrismaClient
): StreamAdapter | null {
  switch (adapterType) {
    case 'csv':
      return new CsvFileAdapter(streamId, instanceDb);

    case 'telegram-bot':
      return new TelegramBotAdapter(streamId, instanceDb);

    case 'zulip':  // ADD THIS
      return new ZulipBotAdapter(streamId, instanceDb);

    default:
      return null;
  }
}

// In injectEnvVars() method
private injectEnvVars(adapterConfig: any, adapterType: string, instanceId: string): any {
  const config = { ...adapterConfig };
  const instanceUpper = instanceId.toUpperCase();

  switch (adapterType) {
    // ... existing telegram case ...

    case 'zulip':  // ADD THIS
      // Check for credentials in order of precedence
      const instanceEmailKey = `${instanceUpper}_ZULIP_BOT_EMAIL`;
      const instanceApiKeyKey = `${instanceUpper}_ZULIP_API_KEY`;

      if (process.env[instanceEmailKey]) {
        config.email = process.env[instanceEmailKey];
        console.log(`Using Zulip email from ${instanceEmailKey} (env)`);
      } else if (process.env.ZULIP_BOT_EMAIL && !config.email) {
        config.email = process.env.ZULIP_BOT_EMAIL;
        console.log(`Using Zulip email from ZULIP_BOT_EMAIL (env)`);
      }

      if (process.env[instanceApiKeyKey]) {
        config.apiKey = process.env[instanceApiKeyKey];
        console.log(`Using Zulip API key from ${instanceApiKeyKey} (env)`);
      } else if (process.env.ZULIP_API_KEY && !config.apiKey) {
        config.apiKey = process.env.ZULIP_API_KEY;
        console.log(`Using Zulip API key from ZULIP_API_KEY (env)`);
      }

      // Optional: override config values from env
      if (process.env.ZULIP_SITE && !config.site) {
        config.site = process.env.ZULIP_SITE;
      }
      if (process.env.ZULIP_POLLING_INTERVAL && !config.pollingInterval) {
        config.pollingInterval = parseInt(process.env.ZULIP_POLLING_INTERVAL);
      }
      if (process.env.ZULIP_BATCH_SIZE && !config.batchSize) {
        config.batchSize = parseInt(process.env.ZULIP_BATCH_SIZE);
      }
      break;

    // ... other cases ...
  }

  return config;
}
```

### 3.3 Stream Configuration Setup

**Option 1: Manual Database Setup (Recommended for initial deployment)**

```sql
-- For Project A instance (using projectadocs database)
INSERT INTO stream_configs (
  stream_id,
  adapter_type,
  config,
  enabled,
  schedule,
  created_at,
  updated_at
) VALUES (
  'projecta-zulip-community-support',
  'zulip',
  '{
    "site": "https://projecta.zulipchat.com",
    "channel": "community-support",
    "pollingInterval": 30000,
    "batchSize": 100,
    "ignoreOldMessages": true
  }'::jsonb,
  true,
  '*/30 * * * *',  -- Every 30 minutes
  NOW(),
  NOW()
);
```

**Option 2: Admin API Endpoint (Future enhancement)**

```typescript
// POST /api/admin/streams
{
  "instanceId": "projecta",
  "adapterType": "zulip",
  "config": {
    "site": "https://projecta.zulipchat.com",
    "channel": "community-support",
    "pollingInterval": 30000,
    "batchSize": 100
  },
  "schedule": "*/30 * * * *"
}
```

---

## 4. Environment Configuration

### 4.1 Environment Variables

**Add to `.env.example`:**

```bash
# ===== Zulip Stream Adapter =====

# Project A instance Zulip credentials
PROJECTA_ZULIP_BOT_EMAIL=projecta-bot@zulipchat.com
PROJECTA_ZULIP_API_KEY=your-projecta-zulip-api-key

# Project B instance Zulip credentials
PROJECTB_ZULIP_BOT_EMAIL=projectb-bot@zulipchat.com
PROJECTB_ZULIP_API_KEY=your-projectb-zulip-api-key

# Generic Zulip credentials (fallback)
ZULIP_BOT_EMAIL=generic-bot@zulipchat.com
ZULIP_API_KEY=your-zulip-api-key
ZULIP_SITE=https://yourorg.zulipchat.com

# Optional: Override config values
ZULIP_POLLING_INTERVAL=30000  # 30 seconds
ZULIP_BATCH_SIZE=100
```

### 4.2 Zulip Bot Setup

**Steps to create Zulip bot:**

1. Go to Zulip organization settings
2. Navigate to "Bots" section
3. Create new bot: "Generic bot" type
4. Copy bot email and API key
5. Subscribe bot to target channel/stream
6. Set bot permissions (read messages, no send required)

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Create:** `server/stream/adapters/__tests__/zulip-bot-adapter.test.ts`

```typescript
describe('ZulipBotAdapter', () => {
  test('validates config with required fields', () => {
    const adapter = new ZulipBotAdapter('test-stream', mockDb);
    const valid = adapter.validateConfig({
      email: 'bot@zulipchat.com',
      apiKey: 'abc123',
      site: 'https://test.zulipchat.com',
      channel: 'general',
    });
    expect(valid).toBe(true);
  });

  test('rejects invalid config', () => {
    const adapter = new ZulipBotAdapter('test-stream', mockDb);
    const valid = adapter.validateConfig({ email: 'bot@zulipchat.com' });
    expect(valid).toBe(false);
  });

  test('normalizes Zulip message to StreamMessage', () => {
    // Test message normalization
  });

  test('builds correct auth header', () => {
    // Test Basic auth header generation
  });
});
```

### 5.2 Integration Tests

**Create:** `tests/zulip-adapter-integration.test.ts`

```typescript
describe('ZulipBotAdapter Integration', () => {
  test('fetches messages from real Zulip channel', async () => {
    // Requires real Zulip credentials
    const adapter = new ZulipBotAdapter('test-zulip', db);
    await adapter.initialize(config);

    const messages = await adapter.fetchMessages();
    expect(messages.length).toBeGreaterThan(0);
  });

  test('handles incremental fetch with watermark', async () => {
    // Test watermark-based fetching
  });

  test('stores messages in UnifiedMessage table', async () => {
    // Verify database storage
  });
});
```

### 5.3 Manual Testing

**Test scenarios:**

1. **Single stream fetch:**
   ```bash
   # Set env vars
   export PROJECTA_ZULIP_BOT_EMAIL=bot@zulipchat.com
   export PROJECTA_ZULIP_API_KEY=abc123

   # Run import
   curl -X POST http://localhost:3762/api/admin/streams/projecta-zulip-community-support/import
   ```

2. **Concurrent streams:**
   ```bash
   # Start both Zulip and Telegram for Project A
   curl -X POST http://localhost:3762/api/admin/streams/run-all
   ```

3. **Multi-tenant:**
   ```bash
   # Verify Project A and Project B Zulip streams run independently
   ```

---

## 6. Migration & Cleanup

### 6.1 Deprecation Timeline

**Phase 1: Implementation (Week 1)**
- Implement ZulipBotAdapter
- Add StreamManager integration
- Test with Project A instance

**Phase 2: Validation (Week 2)**
- Run new adapter alongside legacy scraper
- Verify message parity
- Monitor for issues

**Phase 3: Migration (Week 3)**
- Switch production to new adapter
- Monitor for 48 hours
- Confirm no regressions

**Phase 4: Cleanup (Week 4)**
- Remove `server/scraper/zulipchat.ts`
- Remove `ScrapedMessage` and `ScrapeMetadata` models (if not used by other code)
- Remove old scraper routes/endpoints
- Update documentation

### 6.2 Files to Remove

After successful migration:

```bash
# Adapter files
rm server/scraper/zulipchat.ts

# Database models (if unused)
# Update prisma/schema.prisma to remove:
# - ScrapedMessage model
# - ScrapeMetadata model
# - MessageSource enum (if only used by old models)

# Any routes that call old scraper
# Check server/routes.ts for references

# Old tests
rm tests/zulipchat-scraper.test.ts  # if exists
```

---

## 7. Documentation Updates

### 7.1 Admin Guide

**Create:** `docs/admin/zulip-stream-setup.md`

- How to create Zulip bot
- How to configure stream in database
- Environment variable reference
- Troubleshooting common issues

### 7.2 README Updates

**Update:** `README.md`

- Add Zulip to supported stream types
- Document multi-stream capabilities
- Link to admin guide

---

## 8. Success Criteria

- [ ] ZulipBotAdapter implements all required methods
- [ ] Adapter validates configuration correctly
- [ ] Messages fetch and store in UnifiedMessage table
- [ ] Watermark tracking works for incremental fetches
- [ ] StreamManager creates and manages Zulip streams
- [ ] Environment variable injection works (instance-specific and generic)
- [ ] Concurrent operation with Telegram adapter works
- [ ] Multi-tenant Zulip streams work independently (Project A + Project B)
- [ ] Unit tests achieve >80% coverage
- [ ] Integration tests pass
- [ ] Legacy scraper code removed
- [ ] Documentation updated

---

## 9. Deployment Checklist

**Pre-deployment:**
- [ ] Set Zulip bot credentials in environment
- [ ] Create stream config in database
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Test locally with real Zulip channel

**Deployment:**
- [ ] Deploy to staging
- [ ] Verify stream initializes
- [ ] Verify messages are fetched
- [ ] Check database for UnifiedMessage records
- [ ] Monitor logs for errors

**Post-deployment:**
- [ ] Monitor stream health via `/api/admin/streams/health`
- [ ] Verify scheduled runs execute
- [ ] Check message processing pipeline
- [ ] Validate watermark updates

**Cleanup:**
- [ ] Remove legacy scraper after 1 week of stable operation
- [ ] Run database cleanup migration
- [ ] Archive old documentation

---

## 10. Open Questions

None - implementation approach is clear based on existing TelegramBotAdapter pattern.

---

## 11. References

- Existing adapter: `server/stream/adapters/telegram-bot-adapter.ts`
- Legacy implementation: `server/scraper/zulipchat.ts` (reference only)
- Zulip API docs: https://zulip.com/api/rest
- StreamManager: `server/stream/stream-manager.ts`
- Base adapter: `server/stream/adapters/base-adapter.ts`
