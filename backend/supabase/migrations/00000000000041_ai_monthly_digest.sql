-- LangSmith Feedback Loop — Monthly Quality Digest
-- Immutable snapshot per month. Never updated after creation.
-- Haiku-generated narrative + top issues + fix impact.

CREATE TABLE ai_monthly_digest (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start  DATE NOT NULL UNIQUE,

  narrative    TEXT NOT NULL,

  top_issues   JSONB DEFAULT '[]',

  top_fixes    JSONB DEFAULT '[]',

  stats        JSONB DEFAULT '{}',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_monthly_digest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_monthly_digest"
  ON ai_monthly_digest FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
