-- Migration: Add Conversation Summary
-- Adds summary field to store LLM-generated conversation summaries
-- Author: Wayne
-- Date: 2025-11-03

-- Add summary column to conversation_rag_context table
ALTER TABLE "conversation_rag_context"
ADD COLUMN IF NOT EXISTS "summary" VARCHAR(200);
