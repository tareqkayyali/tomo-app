-- Migration 039: Chat Session Tables for LangGraph Supervisor
-- Phase 4 of the enterprise AI migration
-- Run in Supabase SQL Editor

-- Chat sessions table — tracks conversation threads
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_agent_type TEXT DEFAULT 'output',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_state JSONB DEFAULT '{}',
    message_count   INT DEFAULT 0,
    total_cost_usd  NUMERIC(10, 6) DEFAULT 0,
    total_tokens    INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Chat messages table — individual conversation turns
CREATE TABLE IF NOT EXISTS chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own sessions
CREATE POLICY "Users can read own chat sessions"
    ON chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all sessions (for AI service)
CREATE POLICY "Service role manages chat sessions"
    ON chat_sessions FOR ALL
    USING (auth.role() = 'service_role');

-- Users can read their own messages
CREATE POLICY "Users can read own chat messages"
    ON chat_messages FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all messages (for AI service)
CREATE POLICY "Service role manages chat messages"
    ON chat_messages FOR ALL
    USING (auth.role() = 'service_role');
