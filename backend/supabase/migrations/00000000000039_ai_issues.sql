-- LangSmith Feedback Loop — Issue Detection
-- Stores detected quality issues from 6h collection cycles.
-- Upsert on (week_start, issue_type) prevents duplicates.
-- 9 issue types: routing_miss, verbose_response, zero_tool_response,
--   cost_spike, latency_spike, stale_checkin_high_risk,
--   danger_zone_no_escalation, rag_empty_chunks, capsule_cost_leak

CREATE TABLE ai_issues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  week_start       DATE NOT NULL,
  issue_type       TEXT NOT NULL
    CHECK (issue_type IN (
      'routing_miss', 'verbose_response', 'zero_tool_response',
      'cost_spike', 'latency_spike', 'stale_checkin_high_risk',
      'danger_zone_no_escalation', 'rag_empty_chunks', 'capsule_cost_leak'
    )),

  severity         TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  affected_count   INTEGER NOT NULL DEFAULT 0,

  sample_run_ids   TEXT[] DEFAULT '{}',

  pattern_summary  TEXT,

  metadata         JSONB DEFAULT '{}',

  trend_data       JSONB DEFAULT '{}',

  recurrence_count INTEGER NOT NULL DEFAULT 0,

  last_seen_at     TIMESTAMPTZ,

  status           TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'fix_generated', 'fix_applied', 'resolved', 'dismissed')),

  resolved_at      TIMESTAMPTZ,

  CONSTRAINT uq_issue_week_type UNIQUE (week_start, issue_type)
);

CREATE INDEX idx_ai_issues_week    ON ai_issues (week_start DESC);
CREATE INDEX idx_ai_issues_type    ON ai_issues (issue_type);
CREATE INDEX idx_ai_issues_status  ON ai_issues (status);

ALTER TABLE ai_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_issues"
  ON ai_issues FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
