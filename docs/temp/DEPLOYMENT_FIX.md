# Deployment Fix - Widget Domain & Database Population

## Issues Identified

1. **Hardcoded localhost in widget**: The widget was using `http://localhost:5173` instead of the production App Runner URL
2. **Empty database**: No documentation sections in database, only scraped Zulip messages

## Changes Made

### 1. Fixed Widget Domain ([Dockerfile](../../Dockerfile))

**Before:**
```dockerfile
ARG WIDGET_DOMAIN=https://experthub.lionscraft.io
ENV WIDGET_DOMAIN=$WIDGET_DOMAIN
```

**After:**
```dockerfile
ARG WIDGET_DOMAIN=https://euk5cmmqyr.eu-central-1.awsapprunner.com
ENV VITE_WIDGET_DOMAIN=$WIDGET_DOMAIN  # Note: VITE_ prefix required!
```

**Why:** Vite requires the `VITE_` prefix to expose environment variables to the client-side code at build time.

### 2. Created Startup Script ([scripts/permanent/startup.sh](../../scripts/permanent/startup.sh))

The startup script:
- Runs on first container launch
- Imports initial NEAR nodes documentation via `server/scripts/import-near-nodes-content.ts`
- Creates a marker file to prevent re-running on restarts
- Then starts the Node.js server

### 3. Updated Dockerfile

Added to production stage:
```dockerfile
# Copy startup script and server scripts for initialization
COPY scripts/permanent/startup.sh ./scripts/permanent/startup.sh
COPY server ./server
COPY shared ./shared

# Make startup script executable
RUN chmod +x ./scripts/permanent/startup.sh
```

Changed CMD:
```dockerfile
CMD ["./scripts/permanent/startup.sh"]
```

## Deployment Steps

1. **Commit changes:**
   ```bash
   git add Dockerfile scripts/permanent/startup.sh
   git commit -m "Fix widget domain and auto-populate database on startup"
   git push
   ```

2. **Rebuild and deploy:**
   - App Runner will automatically detect the push and rebuild
   - On first run, the startup script will import documentation
   - Subsequent restarts will skip the import

3. **Verify:**
   ```bash
   # Check that docs are loaded
   curl https://euk5cmmqyr.eu-central-1.awsapprunner.com/api/docs

   # Should return array of documentation sections, not empty []
   ```

## Alternative: Manual Population

If you need to populate without redeploying:

```bash
# Using the trigger-job endpoint (requires Zulip + Gemini credentials)
curl -X POST https://euk5cmmqyr.eu-central-1.awsapprunner.com/api/trigger-job \
  -H "Authorization: Bearer near_docs_admin_2025_secure_token_xyz788" \
  -H "Content-Type: application/json" \
  -d '{"scrapeLimit": 100, "analysisLimit": 50, "channelName": "community-support"}'
```

**Note:** This only scrapes/analyzes messages. It won't populate static documentation.

## Expected Results After Fix

1. ✅ Widget domain will be `https://euk5cmmqyr.eu-central-1.awsapprunner.com`
2. ✅ Database will contain 24 documentation sections on first startup
3. ✅ CSS will load correctly (was failing due to localhost reference)
4. ✅ "reconnecting..." errors will stop (was trying to connect to localhost)

## Testing

After deployment:
1. Visit: https://euk5cmmqyr.eu-central-1.awsapprunner.com
2. Check browser console - should NOT see localhost references
3. Check API: https://euk5cmmqyr.eu-central-1.awsapprunner.com/api/docs
4. Verify documentation sections are displayed

## Rollback

If issues occur, you can quickly rollback by removing the startup script:

```dockerfile
# Dockerfile - restore original CMD
CMD ["node", "dist/index.js"]
```
