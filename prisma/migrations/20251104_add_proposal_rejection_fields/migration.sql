-- Add proposal rejection tracking fields to conversation_rag_context
ALTER TABLE "conversation_rag_context"
  ADD COLUMN IF NOT EXISTS "proposals_rejected" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

-- Add comment
COMMENT ON COLUMN "conversation_rag_context"."proposals_rejected" IS 'True if LLM decided no documentation proposals were needed for this conversation';
COMMENT ON COLUMN "conversation_rag_context"."rejection_reason" IS 'Explanation from LLM about why no proposals were generated';
