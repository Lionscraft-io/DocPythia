-- Multi-Stream Scanner Phase 1: Admin Message Analysis View
-- This materialized view provides a comprehensive dashboard view of all processed messages

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS admin_message_analysis;

-- Create materialized view for admin dashboard
CREATE MATERIALIZED VIEW admin_message_analysis AS
SELECT
  um.id,
  um.stream_id,
  um.message_id,
  um.timestamp,
  um.author,
  um.content,
  um.channel,
  mc.category,
  mc.doc_value,
  mc.doc_value_reason,
  mc.confidence as classification_confidence,
  dp.page as proposed_page,
  dp.update_type,
  dp.suggested_text,
  dp.confidence as proposal_confidence,
  dr.approved,
  dr.action as review_action,
  dr.confidence as review_confidence,
  dr.reasons as review_reasons,
  ARRAY_AGG(DISTINCT (mrc.retrieved_docs::jsonb -> 'doc_id')::text) FILTER (WHERE mrc.retrieved_docs IS NOT NULL) as related_rag_docs,
  um.created_at
FROM unified_messages um
LEFT JOIN message_classification mc ON mc.message_id = um.id
LEFT JOIN doc_proposals dp ON dp.message_id = um.id
LEFT JOIN doc_reviews dr ON dr.proposal_id = dp.id
LEFT JOIN message_rag_context mrc ON mrc.message_id = um.id
GROUP BY
  um.id, um.stream_id, um.message_id, um.timestamp, um.author, um.content, um.channel,
  mc.category, mc.doc_value, mc.doc_value_reason, mc.confidence,
  dp.page, dp.update_type, dp.suggested_text, dp.confidence,
  dr.approved, dr.action, dr.confidence, dr.reasons, um.created_at
ORDER BY um.created_at DESC;

-- Create indexes for fast queries
CREATE INDEX idx_admin_analysis_approved ON doc_reviews(approved);
CREATE INDEX idx_admin_analysis_timestamp ON unified_messages(timestamp DESC);
CREATE INDEX idx_classification_doc_value ON message_classification(doc_value);

-- Refresh materialized view (can be called periodically or after inserts)
-- REFRESH MATERIALIZED VIEW admin_message_analysis;
