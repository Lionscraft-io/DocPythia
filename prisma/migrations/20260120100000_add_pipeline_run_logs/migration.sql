-- Drop and recreate pipeline_run_logs with correct schema
DROP TABLE IF EXISTS "pipeline_run_logs";

-- CreateTable: pipeline_run_logs
CREATE TABLE IF NOT EXISTS "pipeline_run_logs" (
    "id" SERIAL NOT NULL,
    "instance_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "input_messages" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "output_threads" INTEGER,
    "output_proposals" INTEGER,
    "total_duration_ms" INTEGER,
    "llm_calls" INTEGER,
    "llm_tokens_used" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

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

-- CreateIndex (using IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "processing_watermark_stream_id_key" ON "processing_watermark"("stream_id");
