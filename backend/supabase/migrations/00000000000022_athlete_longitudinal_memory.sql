-- Athlete Longitudinal Memory — cross-session context persistence
-- Stores AI-generated session summaries so future sessions start with context

CREATE TABLE athlete_longitudinal_memory (
  athlete_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_json   JSONB NOT NULL DEFAULT '{}',
  session_count INT NOT NULL DEFAULT 0,
  last_session_summary TEXT,
  last_updated  TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS: athletes can read their own memory, service role writes
ALTER TABLE athlete_longitudinal_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes can read own memory"
  ON athlete_longitudinal_memory FOR SELECT
  USING (athlete_id = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_athlete_memory_updated ON athlete_longitudinal_memory (last_updated);

COMMENT ON TABLE athlete_longitudinal_memory IS
  'Stores AI-generated cross-session context for each athlete. memory_json contains structured memory fields (goals, concerns, injury history, behavioral patterns). Updated at end of sessions with 5+ turns.';

COMMENT ON COLUMN athlete_longitudinal_memory.memory_json IS
  'Structured memory: { currentGoals: string[], unresolvedConcerns: string[], injuryHistory: string[], behavioralPatterns: string[], coachingPreferences: string[], lastTopics: string[] }';
