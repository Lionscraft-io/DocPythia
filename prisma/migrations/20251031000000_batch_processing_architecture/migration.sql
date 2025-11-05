-- Migration: Batch Processing Architecture
-- Implements dual watermark system and removes review step
-- Author: Wayne
-- Date: 2025-10-31

-- Step 1: Rename stream_watermarks to import_watermarks and update structure
ALTER TABLE "stream_watermarks" RENAME TO "import_watermarks";
ALTER TABLE "import_watermarks" RENAME COLUMN "last_processed_time" TO "last_imported_time";
ALTER TABLE "import_watermarks" RENAME COLUMN "last_processed_id" TO "last_imported_id";
ALTER TABLE "import_watermarks" RENAME COLUMN "last_updated_at" TO "updated_at";
ALTER TABLE "import_watermarks" ADD COLUMN "stream_type" VARCHAR(50);
ALTER TABLE "import_watermarks" ADD COLUMN "resource_id" VARCHAR(255);
ALTER TABLE "import_watermarks" ADD COLUMN "import_complete" BOOLEAN DEFAULT FALSE;
ALTER TABLE "import_watermarks" ADD COLUMN "created_at" TIMESTAMP DEFAULT NOW();
ALTER TABLE "import_watermarks" DROP COLUMN IF EXISTS "total_processed";

-- Update stream_type from stream_configs
UPDATE "import_watermarks" iw
SET stream_type = sc.adapter_type
FROM "stream_configs" sc
WHERE iw.stream_id = sc.stream_id;

-- Make stream_type and created_at NOT NULL after backfill
ALTER TABLE "import_watermarks" ALTER COLUMN "stream_type" SET NOT NULL;
ALTER TABLE "import_watermarks" ALTER COLUMN "created_at" SET NOT NULL;

-- Update unique constraint
ALTER TABLE "import_watermarks" DROP CONSTRAINT IF EXISTS "stream_watermarks_stream_id_key";
CREATE UNIQUE INDEX "import_watermarks_stream_resource_unique" ON "import_watermarks"("stream_id", "resource_id");

-- Step 2: Create processing_watermark table (single row)
CREATE TABLE "processing_watermark" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "watermark_time" TIMESTAMP NOT NULL,
  "last_processed_batch" TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT NOW(),
  CHECK (id = 1)
);

-- Initialize with current time minus 7 days
INSERT INTO "processing_watermark" ("watermark_time", "last_processed_batch")
VALUES (NOW() - INTERVAL '7 days', NULL);

-- Step 3: Update message_classification table
ALTER TABLE "message_classification" ADD COLUMN "batch_id" VARCHAR(50);
ALTER TABLE "message_classification" ADD COLUMN "suggested_doc_page" VARCHAR(255);
ALTER TABLE "message_classification" DROP COLUMN IF EXISTS "current_docs";
ALTER TABLE "message_classification" DROP COLUMN IF EXISTS "is_update";
ALTER TABLE "message_classification" ALTER COLUMN "doc_value_reason" SET NOT NULL;

-- Create index on batch_id
CREATE INDEX "idx_classification_batch" ON "message_classification"("batch_id");

-- Step 4: Update doc_proposals table
ALTER TABLE "doc_proposals" ADD COLUMN "location" JSONB;
ALTER TABLE "doc_proposals" ADD COLUMN "source_conversation" JSONB;
ALTER TABLE "doc_proposals" ADD COLUMN "admin_approved" BOOLEAN DEFAULT FALSE;
ALTER TABLE "doc_proposals" ADD COLUMN "admin_reviewed_at" TIMESTAMP;
ALTER TABLE "doc_proposals" ADD COLUMN "admin_reviewed_by" VARCHAR(255);
ALTER TABLE "doc_proposals" ADD COLUMN "confidence" DECIMAL(3,2);

-- Migrate character_range to location JSON
UPDATE "doc_proposals"
SET location = jsonb_build_object('character_range', character_range)
WHERE character_range IS NOT NULL;

-- Drop old character_range column (data preserved in location)
ALTER TABLE "doc_proposals" DROP COLUMN IF EXISTS "character_range";

-- Create indexes
CREATE INDEX "idx_proposals_approved" ON "doc_proposals"("admin_approved");

-- Step 5: Remove doc_reviews table and related constraints
DROP TABLE IF EXISTS "doc_reviews" CASCADE;

-- Step 6: Update message_rag_context
ALTER TABLE "message_rag_context" DROP COLUMN IF EXISTS "retrieved_messages";
ALTER TABLE "message_rag_context" DROP COLUMN IF EXISTS "formatted_context";

-- Step 7: Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_messages_timestamp" ON "unified_messages"("timestamp");
CREATE INDEX IF NOT EXISTS "idx_import_watermarks_stream" ON "import_watermarks"("stream_id", "resource_id");

-- Step 8: Create materialized view for admin dashboard
DROP MATERIALIZED VIEW IF EXISTS "admin_message_analysis";

CREATE MATERIALIZED VIEW "admin_message_analysis" AS
SELECT
  um.id,
  um.stream_id,
  um.message_id,
  um.timestamp,
  um.author,
  um.content,
  um.channel,
  mc.category,
  mc.doc_value_reason,
  mc.suggested_doc_page,
  mc.batch_id,
  dp.page as proposed_page,
  dp.update_type,
  dp.suggested_text,
  dp.confidence as proposal_confidence,
  dp.admin_approved,
  dp.admin_reviewed_at,
  dp.admin_reviewed_by,
  COALESCE(jsonb_array_length(mrc.retrieved_docs), 0) as rag_docs_count,
  um.created_at
FROM "unified_messages" um
INNER JOIN "message_classification" mc ON mc.message_id = um.id
LEFT JOIN "doc_proposals" dp ON dp.message_id = um.id
LEFT JOIN "message_rag_context" mrc ON mrc.message_id = um.id
ORDER BY um.created_at DESC;

-- Create index on materialized view
CREATE INDEX "idx_admin_analysis_timestamp" ON "admin_message_analysis"("created_at");
CREATE INDEX "idx_admin_analysis_approved" ON "admin_message_analysis"("admin_approved");
CREATE INDEX "idx_admin_analysis_batch" ON "admin_message_analysis"("batch_id");
