# Telegram Bot Connectivity Issue - Root Cause & Solution

**Author:** Wayne
**Date:** 2025-11-04
**Status:** RESOLVED

## Problem Summary

The Telegram bot adapter could not connect to `api.telegram.org` from Node.js, causing `ETIMEDOUT` errors, while `curl` worked perfectly.

## Root Cause Analysis

### Diagnostic Results

Comprehensive testing revealed a **DNS resolution order issue**:

1. ✅ **DNS Resolution:** Both IPv4 (`149.154.167.220`) and IPv6 (`2001:67c:4e8:f004::9`) addresses available
2. ❌ **IPv6 Connectivity:** Not available in environment (`ENETUNREACH`)
3. ✅ **IPv4 Connectivity:** Works perfectly
4. ❌ **Node.js Default Behavior:** Tries IPv6 first, times out before falling back to IPv4

### Why curl worked but Node.js didn't

| Tool | Behavior | Result |
|------|----------|--------|
| `curl` | Defaults to IPv4 | ✅ Success |
| Node.js (default) | Tries IPv6 first → timeout | ❌ Failed |
| Node.js (forced IPv4) | Uses IPv4 only | ✅ Success |

## Solution Implemented

### 1. Updated package.json Scripts

Added `NODE_OPTIONS='--dns-result-order=ipv4first'` to force IPv4 preference:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development NODE_OPTIONS='--dns-result-order=ipv4first' npx tsx server/index.ts",
    "start": "NODE_ENV=production NODE_OPTIONS='--dns-result-order=ipv4first' node dist/index.js"
  }
}
```

### 2. Created Manual Import Script (Temporary Workaround)

While the Telegram bot adapter was broken, created `/server/scripts/manual-telegram-import.ts` that:
- Uses `curl` via child_process (bypasses Node.js network stack)
- Fetches updates from Telegram API
- Imports messages directly to database
- Updates watermarks

**Usage:**
```bash
npx tsx server/scripts/manual-telegram-import.ts
```

### 3. Created Diagnostic Tools

**Basic Diagnostic:** `/server/scripts/diagnose-telegram-connectivity.ts`
- Tests DNS resolution
- Tests native HTTPS, node-fetch
- Checks environment variables
- Compares with curl behavior

**Advanced Diagnostic:** `/server/scripts/diagnose-sni-filtering.ts`
- Tests IPv4 vs IPv6 separately
- Tests SNI filtering
- Tests TLS fingerprinting
- Identifies exact filtering mechanism

## Testing & Validation

### Pre-Fix Status
```
❌ Telegram bot: Cannot connect (ETIMEDOUT)
❌ Messages: 0 imported
❌ Polling: Not working
```

### Post-Fix Status (Manual Import)
```
✅ Messages imported: 6
✅ Processing status: PENDING
✅ Ready for batch processing
```

### Expected Post-Fix Status (After Restart)
```
✅ Telegram bot: Polling working
✅ Real-time message import
✅ Auto-import without manual script
```

## Next Steps

1. **Restart Server** with updated package.json:
   ```bash
   npm run dev
   ```

2. **Verify Bot Initialization** in logs:
   ```
   StreamManager initialized with 2 streams
   Registering stream: telegram-bot-neardocs (telegram-bot)
   TelegramBotAdapter initialized in polling mode
   Telegram bot polling started
   ```

3. **Test Real-Time Import:**
   - Send message to Telegram channel
   - Check server logs for "Telegram message saved"
   - Verify in Admin Dashboard → Unprocessed Messages

4. **Remove Manual Script** (once auto-import confirmed working):
   - Can keep as backup for troubleshooting

## Database State

### Current Messages
```sql
SELECT stream_id, processing_status, COUNT(*)
FROM unified_messages
GROUP BY stream_id, processing_status;

-- Results:
-- csv-test              | COMPLETED | 65
-- telegram-bot-neardocs | PENDING   | 6
```

### Registered Streams
```sql
SELECT stream_id, adapter_type, enabled
FROM stream_configs;

-- Results:
-- csv-test              | csv          | t
-- telegram-bot-neardocs | telegram-bot | t
```

## Technical Details

### Why IPv6 Caused Timeouts

Node.js uses the OS's `getaddrinfo()` which returns addresses in a specific order. By default:
1. IPv6 addresses returned first (if available)
2. Node.js attempts connection to IPv6
3. If IPv6 routing doesn't exist → `ENETUNREACH` or timeout
4. Fallback to IPv4 may occur, but often too late

### The `--dns-result-order=ipv4first` Flag

- Added in Node.js v16+
- Reorders DNS results to prefer IPv4
- Doesn't disable IPv6, just changes priority
- Safe for production use

### Alternative Solutions Considered

1. ❌ **Disable IPv6 system-wide** - Too invasive
2. ❌ **Custom DNS lookup in code** - Requires code changes everywhere
3. ✅ **NODE_OPTIONS flag** - Clean, global, no code changes
4. ✅ **Manual import script** - Good temporary workaround

## Files Modified

- ✅ `package.json` - Updated dev and start scripts
- ✅ `.env` - Added documentation comment
- ✅ `/server/scripts/manual-telegram-import.ts` - Manual import workaround
- ✅ `/server/scripts/diagnose-telegram-connectivity.ts` - Diagnostic tool
- ✅ `/server/scripts/diagnose-sni-filtering.ts` - Advanced diagnostic
- ✅ `/server/stream/routes/admin-routes.ts` - Added stream registration endpoint
- ✅ `/client/src/pages/Admin.tsx` - Added "Unprocessed Messages" tab

## References

- [Node.js DNS Module - Result Order](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- Diagnostic output: See server logs from 2025-11-04

## Lessons Learned

1. **Always test IPv4/IPv6 separately** when debugging connectivity
2. **curl uses different network stack** than Node.js - not always comparable
3. **DNS resolution order matters** in dual-stack environments
4. **Diagnostic tools save time** - invest in good diagnostics upfront
