# Telegram Hostname Blocking Workaround

## Issue
Node.js cannot connect to `api.telegram.org` (hostname) but CAN connect to the IP directly (`149.154.167.220`).

## Root Cause
Network-level hostname filtering (SNI inspection) is blocking the Telegram domain while allowing direct IP connections.

## Solution: Custom HTTPS Agent for Telegraf

Modify the TelegramBotAdapter to use a custom HTTPS agent that connects to the IP but sends the correct Host header:

```typescript
import https from 'https';
import { Telegraf } from 'telegraf';

// Create custom agent that connects to IP but uses correct hostname
const telegramAgent = new https.Agent({
  // Connect to IP
  lookup: (hostname, options, callback) => {
    if (hostname === 'api.telegram.org') {
      // Force IP resolution
      callback(null, '149.154.167.220', 4);
    } else {
      // Normal DNS lookup for other hosts
      require('dns').lookup(hostname, options, callback);
    }
  },
});

// Pass agent to Telegraf
const bot = new Telegraf(token, {
  telegram: {
    agent: telegramAgent,
  },
});
```

## Alternative: Environment Variable Override

Set in `.env`:
```bash
# Force Telegram API to use IP
TELEGRAM_API_HOST=149.154.167.220
```

Then modify adapter to use this in API calls.

## Current Workaround

Use the manual import script which uses `curl` (unaffected by Node.js filtering):

```bash
npx tsx server/scripts/manual-telegram-import.ts
```

This should be run periodically (e.g., cron job) to import new messages.
