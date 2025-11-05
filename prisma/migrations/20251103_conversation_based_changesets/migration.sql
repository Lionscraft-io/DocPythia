-- Migration: Conversation-Based Changesets
-- Changes message processing from per-message to conversation-based
-- Author: Wayne
-- Date: 2025-11-03

-- Note: These changes were applied during development/testing
-- This migration marks them as officially applied

-- 1. Add conversation_id to message_classification (already applied)
-- ALTER TABLE "message_classification" ADD COLUMN IF NOT EXISTS "conversation_id" VARCHAR(255);
-- CREATE INDEX IF NOT EXISTS "idx_message_classification_conversation" ON "message_classification"("conversation_id");

-- 2. Remove doc_value column (already applied)
-- ALTER TABLE "message_classification" DROP COLUMN IF EXISTS "doc_value";

-- 3. Remove confidence field from doc_proposals (already applied)
-- ALTER TABLE "doc_proposals" DROP COLUMN IF EXISTS "confidence";

-- 4. Change doc_proposals to conversation-based (already applied)
-- The table was recreated to use conversation_id instead of message_id
-- Added source_messages JSONB field to track which messages contributed

-- 5. Rename message_rag_context to conversation_rag_context (already applied)
-- The table was recreated as conversation_rag_context

-- Verify current schema state
DO $$
BEGIN
    -- Check that conversation_id exists in message_classification
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_classification'
        AND column_name = 'conversation_id'
    ) THEN
        RAISE EXCEPTION 'conversation_id column missing from message_classification';
    END IF;

    -- Check that doc_value doesn't exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_classification'
        AND column_name = 'doc_value'
    ) THEN
        RAISE EXCEPTION 'doc_value column should have been removed';
    END IF;

    -- Check that conversation_rag_context exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'conversation_rag_context'
    ) THEN
        RAISE EXCEPTION 'conversation_rag_context table missing';
    END IF;

    RAISE NOTICE 'Schema verification passed - conversation-based architecture in place';
END $$;
