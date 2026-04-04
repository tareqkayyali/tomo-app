-- ============================================================
-- Phase 4 Migration Scripts — Execute manually in Supabase SQL Editor
-- ============================================================

-- Migration 029: Add conversation_summary to chat_sessions (PSC)
-- Stores compressed summary of older turns for token budget optimization
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS conversation_summary TEXT;

-- Migration 030: Athlete Behavioral Fingerprint
-- Weekly-computed behavioral dimensions for coaching personalization
CREATE TABLE IF NOT EXISTS athlete_behavioral_fingerprint (
  athlete_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  compliance_rate REAL DEFAULT 0,
  session_consistency REAL DEFAULT 0,
  recovery_response REAL DEFAULT 0,
  academic_athletic_balance REAL DEFAULT 0,
  coaching_approach TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: athletes can read their own fingerprint
ALTER TABLE athlete_behavioral_fingerprint ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athletes read own fingerprint" ON athlete_behavioral_fingerprint
  FOR SELECT USING (athlete_id = auth.uid());

-- Migration 031: Add adaptation_coefficient and tomo_intelligence_score to snapshots
ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS adaptation_coefficient REAL,
  ADD COLUMN IF NOT EXISTS tomo_intelligence_score REAL;

-- Migration 032: Add decay columns to athlete_recommendations
ALTER TABLE athlete_recommendations
  ADD COLUMN IF NOT EXISTS decay_score REAL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS decayed_at TIMESTAMPTZ;
