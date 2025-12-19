-- Migration: Convert global processing watermark to per-stream watermarks
-- Author: Wayne
-- Date: 2025-11-18

BEGIN;

-- Step 1: Backup existing watermark data
CREATE TEMP TABLE watermark_backup AS
SELECT * FROM processing_watermark;

-- Step 2: Drop the existing table
DROP TABLE processing_watermark;

-- Step 3: Create new table with per-stream watermarks
CREATE TABLE processing_watermark (
  id SERIAL PRIMARY KEY,
  stream_id VARCHAR NOT NULL UNIQUE,
  watermark_time TIMESTAMP NOT NULL,
  last_processed_batch TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 4: Initialize watermarks for existing streams based on their earliest message
INSERT INTO processing_watermark (stream_id, watermark_time, last_processed_batch, updated_at)
SELECT
  stream_id,
  COALESCE(MIN(timestamp), (SELECT watermark_time FROM watermark_backup LIMIT 1)) as watermark_time,
  NULL as last_processed_batch,
  NOW() as updated_at
FROM unified_messages
GROUP BY stream_id
ON CONFLICT (stream_id) DO NOTHING;

-- Step 5: Add index for performance
CREATE INDEX idx_processing_watermark_stream_id ON processing_watermark(stream_id);

COMMIT;

-- Verify migration
SELECT
  stream_id,
  watermark_time,
  last_processed_batch,
  updated_at
FROM processing_watermark
ORDER BY stream_id;
