-- Repair migration: Ensure pipeline_run_logs table has correct schema
-- This handles cases where a previous migration partially applied

-- Create table if it doesn't exist
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

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- input_messages
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'input_messages') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "input_messages" INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- steps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'steps') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "steps" JSONB NOT NULL DEFAULT '[]';
    END IF;

    -- output_threads
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'output_threads') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "output_threads" INTEGER;
    END IF;

    -- output_proposals
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'output_proposals') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "output_proposals" INTEGER;
    END IF;

    -- total_duration_ms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'total_duration_ms') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "total_duration_ms" INTEGER;
    END IF;

    -- llm_calls
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'llm_calls') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "llm_calls" INTEGER;
    END IF;

    -- llm_tokens_used
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'llm_tokens_used') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "llm_tokens_used" INTEGER;
    END IF;

    -- error_message
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'error_message') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "error_message" TEXT;
    END IF;

    -- completed_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_run_logs' AND column_name = 'completed_at') THEN
        ALTER TABLE "pipeline_run_logs" ADD COLUMN "completed_at" TIMESTAMP(3);
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_instance_id_idx" ON "pipeline_run_logs"("instance_id");
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_batch_id_idx" ON "pipeline_run_logs"("batch_id");
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_created_at_idx" ON "pipeline_run_logs"("created_at");
CREATE INDEX IF NOT EXISTS "pipeline_run_logs_status_idx" ON "pipeline_run_logs"("status");
