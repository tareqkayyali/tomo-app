-- Conversation Plans — Multi-step workflow tracking for AI Chat v2
-- Stores structured workflow state that persists across turns within a session.
-- Used by the planner_node to track multi-agent workflows
-- (e.g., "build session + schedule it" = Performance agent → Planning agent).
-- 60-minute TTL — stale plans auto-expire.

CREATE TABLE IF NOT EXISTS conversation_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    plan_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '60 minutes'
);

CREATE INDEX IF NOT EXISTS idx_conversation_plans_session
    ON conversation_plans (session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_plans_expires
    ON conversation_plans (expires_at);

-- RLS: service role only (AI service writes, not athlete-facing)
ALTER TABLE conversation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on conversation_plans"
    ON conversation_plans FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Also add missing columns to ai_trace_log that the insights engine expects
ALTER TABLE ai_trace_log
    ADD COLUMN IF NOT EXISTS assistant_response TEXT,
    ADD COLUMN IF NOT EXISTS turn_number INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS response_length_chars INTEGER DEFAULT 0;

-- Shadow classifier comparison column for A/B logging
ALTER TABLE ai_trace_log
    ADD COLUMN IF NOT EXISTS sonnet_shadow JSONB;
