-- LangSmith Feedback Loop — AI-Generated Fix Recommendations
-- Each fix linked to an issue. Lifecycle: pending → approved → applied → verified.
-- Impact tracked via before_metric / after_metric post-apply.

CREATE TABLE ai_fixes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issue_id         UUID NOT NULL REFERENCES ai_issues(id) ON DELETE CASCADE,

  priority         INTEGER NOT NULL DEFAULT 3
    CHECK (priority BETWEEN 1 AND 4),
  -- 1=safety, 2=cost, 3=quality, 4=ux

  fix_type         TEXT NOT NULL
    CHECK (fix_type IN (
      'intent_registry', 'prompt_builder', 'agent_dispatch',
      'rag_knowledge', 'validate_node', 'context_assembly', 'observability'
    )),

  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  file_path        TEXT,
  code_change      TEXT,

  expected_impact  TEXT,
  langsmith_metric TEXT,

  confidence       NUMERIC(3,2) NOT NULL DEFAULT 0.60,

  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'verified', 'rejected')),

  applied_at       TIMESTAMPTZ,
  applied_by       TEXT,
  verified_at      TIMESTAMPTZ,
  before_metric    NUMERIC,
  after_metric     NUMERIC
);

CREATE INDEX idx_ai_fixes_issue    ON ai_fixes (issue_id);
CREATE INDEX idx_ai_fixes_priority ON ai_fixes (priority ASC);
CREATE INDEX idx_ai_fixes_status   ON ai_fixes (status);

ALTER TABLE ai_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_fixes"
  ON ai_fixes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
