#!/bin/bash

# Populate Database Script
# Imports initial documentation content into the database

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3762}"
ADMIN_TOKEN="${ADMIN_TOKEN:-your_admin_token_here}"

echo "========================================="
echo "Populating Database with Documentation"
echo "========================================="
echo ""
echo "API URL: $API_URL"
echo ""

# Check if the API is reachable
echo "Checking API health..."
if ! curl -f -s "${API_URL}/api/health" > /dev/null; then
    echo "❌ Error: Cannot reach API at $API_URL"
    exit 1
fi
echo "✓ API is reachable"
echo ""

# Options for populating the database
echo "To populate with documentation, run ONE of these commands:"
echo ""
echo "Option 1 - Trigger scraper and analyzer (requires Zulip/Telegram + Gemini API keys):"
echo "  curl -X POST ${API_URL}/api/trigger-job \\"
echo "    -H 'Authorization: Bearer ${ADMIN_TOKEN}' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"scrapeLimit\": 100, \"analysisLimit\": 50, \"channelName\": \"community-support\"}'"
echo ""
echo "Option 2 - Run custom import script in container:"
echo "  docker exec -it <container-id> npx tsx server/scripts/your-import-script.ts"
echo ""
echo "========================================="
