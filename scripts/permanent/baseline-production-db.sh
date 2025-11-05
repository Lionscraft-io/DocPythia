#!/bin/bash

# Baseline Production Database for Prisma Migrations
# This marks all existing migrations as "already applied" so Prisma doesn't try to re-run them
# Use this when migrating an existing database to Prisma migrations

set -e

echo "🔧 Baselining production database..."
echo "This will mark all migrations as applied without running them."
echo ""
echo "IMPORTANT: Only run this if your production database schema matches the latest Prisma schema!"
echo ""

# Mark all migrations as applied
echo "Resolving migrations as applied..."

# Mark each migration as resolved (applied) without running it
npx prisma migrate resolve --applied 20251029_add_pgvector_support
npx prisma migrate resolve --applied 20251030_create_admin_view
npx prisma migrate resolve --applied 20251031000000_batch_processing_architecture
npx prisma migrate resolve --applied 20251103_add_conversation_summary
npx prisma migrate resolve --applied 20251103_conversation_based_changesets
npx prisma migrate resolve --applied 20251104_add_proposal_rejection_fields
npx prisma migrate resolve --applied 20251105_add_discard_reason

echo "✅ All migrations marked as applied"
echo ""
echo "Future migrations will now run normally with 'prisma migrate deploy'"
