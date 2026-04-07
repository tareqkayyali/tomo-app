-- Migration 029: Protocol Review Log
-- Audit trail for sports science configuration changes in the Coaching Intelligence Hub.
-- Every threshold adjustment, rule modification, or protocol change is versioned here
-- with scientific justification and citation for accountability at scale.

CREATE TABLE IF NOT EXISTS protocol_review_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section         TEXT NOT NULL,            -- 'sport_coaching_context' | 'phv_safety_config' | 'readiness_decision_matrix' | 'ai_prompt_templates'
  rule_key        TEXT NOT NULL,            -- which specific rule/threshold was changed
  old_value       JSONB,                    -- previous value (null for new additions)
  new_value       JSONB,                    -- new value (null for deletions)
  observation     TEXT,                     -- what the director observed in the audit that prompted the change
  justification   TEXT NOT NULL,            -- scientific reason for the change (required)
  citation        TEXT,                     -- supporting study/paper reference
  status          TEXT NOT NULL DEFAULT 'logged',  -- 'logged' | 'applied' | 'rejected'
  changed_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ              -- when the change was actually applied to config
);

-- Index for filtering by config section (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_protocol_review_section
  ON protocol_review_log(section);

-- Index for chronological listing (newest first)
CREATE INDEX IF NOT EXISTS idx_protocol_review_created
  ON protocol_review_log(created_at DESC);

-- Index for filtering by status (applied vs logged)
CREATE INDEX IF NOT EXISTS idx_protocol_review_status
  ON protocol_review_log(status);

-- RLS: service role only (admin CMS access)
ALTER TABLE protocol_review_log ENABLE ROW LEVEL SECURITY;
