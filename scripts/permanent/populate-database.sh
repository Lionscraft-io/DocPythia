#!/bin/bash

# Populate Database Script
# Imports initial documentation content into the database

set -e

# Configuration
API_URL="${API_URL:-https://euk5cmmqyr.eu-central-1.awsapprunner.com}"
ADMIN_TOKEN="${ADMIN_TOKEN:-near_docs_admin_2025_secure_token_xyz788}"

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

# Option 1: Import static content via script (requires container access)
echo "To populate with documentation, run ONE of these commands:"
echo ""
echo "Option 1 - Run import script in container:"
echo "  docker exec -it <container-id> npx tsx server/scripts/import-near-nodes-content.ts"
echo ""
echo "Option 2 - Trigger scraper and analyzer (requires Zulip + Gemini API keys):"
echo "  curl -X POST ${API_URL}/api/trigger-job \\"
echo "    -H 'Authorization: Bearer ${ADMIN_TOKEN}' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"scrapeLimit\": 100, \"analysisLimit\": 50, \"channelName\": \"community-support\"}'"
echo ""
echo "Option 3 - Import during deployment:"
echo "  Add to Dockerfile before CMD: RUN npx tsx server/scripts/import-near-nodes-content.ts"
echo ""
echo "========================================="
