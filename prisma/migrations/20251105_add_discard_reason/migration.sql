-- Add discard_reason field to doc_proposals table
-- This field stores the reason why a proposal was discarded/ignored
ALTER TABLE "doc_proposals" ADD COLUMN IF NOT EXISTS "discard_reason" TEXT;
