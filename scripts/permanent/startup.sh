#!/bin/sh

# Startup script for production deployment
# Runs database initialization and starts the server

set -e

echo "========================================="
echo "Starting DocsAI Application"
echo "========================================="
echo ""

# Check if this is the first run by checking for a marker file
FIRST_RUN_MARKER="/app/.initialized"

if [ ! -f "$FIRST_RUN_MARKER" ]; then
    echo "🆕 First run detected - initializing..."

    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo "⚠️  Warning: DATABASE_URL not set, skipping initialization"
    else
        # Run any initialization scripts here
        echo "📥 Running database migrations..."
        # Add custom import scripts as needed
    fi

    # Create marker file
    touch "$FIRST_RUN_MARKER"
    echo "✓ Initialization complete"
    echo ""
else
    echo "✓ Already initialized, skipping initialization"
    echo ""
fi

# Start the application
echo "🚀 Starting server..."
exec node dist/index.js
