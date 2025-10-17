#!/bin/sh

# Startup script for production deployment
# Runs database initialization and starts the server

set -e

echo "========================================="
echo "Starting NearDocsAI Application"
echo "========================================="
echo ""

# Check if this is the first run by checking for a marker file
FIRST_RUN_MARKER="/app/.initialized"

if [ ! -f "$FIRST_RUN_MARKER" ]; then
    echo "🆕 First run detected - importing initial documentation..."

    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo "⚠️  Warning: DATABASE_URL not set, skipping import"
    else
        # Run the import script (it will wait for DB to be ready via server/migrate.ts)
        echo "📥 Importing NEAR nodes documentation..."
        npx tsx server/scripts/import-near-nodes-content.ts || {
            echo "⚠️  Warning: Import failed, but continuing startup..."
        }
    fi

    # Create marker file
    touch "$FIRST_RUN_MARKER"
    echo "✓ Initialization complete"
    echo ""
else
    echo "✓ Already initialized, skipping import"
    echo ""
fi

# Start the application
echo "🚀 Starting server..."
exec node dist/index.js
