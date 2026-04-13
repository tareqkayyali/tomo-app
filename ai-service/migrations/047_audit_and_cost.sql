-- AI Audit Log — every tool call, classification, and response logged
-- for full traceability. This is the enterprise-grade audit trail.

CREATE TABLE IF NOT EXISTS ai_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,  -- 'classification', 'tool_call', 'safety_gate', 'response', 'cost_check'
    event_data JSONB NOT NULL DEFAULT '{}',
    agent_type TEXT,
    cost_usd NUMERIC(10,6) DEFAULT 0,
    latency_ms NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user ON ai_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_session ON ai_audit_log (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_type ON ai_audit_log (event_type, created_at DESC);

ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on ai_audit_log"
    ON ai_audit_log FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add user_id index to ai_trace_log for cost tracking queries
CREATE INDEX IF NOT EXISTS idx_ai_trace_log_user_date
    ON ai_trace_log (user_id, created_at);
