-- CreateTable: pipeline_run_logs
CREATE TABLE IF NOT EXISTS "pipeline_run_logs" (
    "id" SERIAL NOT NULL,
    "instance_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "input_data" JSONB,
    "output_data" JSONB,
    "debug_snapshots" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_instance_id_idx" ON "pipeline_run_logs"("instance_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_batch_id_idx" ON "pipeline_run_logs"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_created_at_idx" ON "pipeline_run_logs"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_status_idx" ON "pipeline_run_logs"("status");

-- AlterTable: Add warnings column to doc_proposals
ALTER TABLE "doc_proposals" ADD COLUMN IF NOT EXISTS "warnings" JSONB;

-- AlterTable: Add use_for_improvement column to ruleset_feedback
ALTER TABLE "ruleset_feedback" ADD COLUMN IF NOT EXISTS "use_for_improvement" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ruleset_feedback_use_for_improvement_idx" ON "ruleset_feedback"("use_for_improvement");

-- AlterTable: Add stream_id column to processing_watermark
ALTER TABLE "processing_watermark" ADD COLUMN IF NOT EXISTS "stream_id" TEXT;

-- CreateIndex (conditional - only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'processing_watermark_stream_id_key') THEN
        CREATE UNIQUE INDEX "processing_watermark_stream_id_key" ON "processing_watermark"("stream_id");
    END IF;
END $$;
