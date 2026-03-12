-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Football Test Results — Persistent storage for physical tests  ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS football_test_results (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  test_type      TEXT NOT NULL,
  primary_value  DOUBLE PRECISION NOT NULL,
  primary_unit   TEXT NOT NULL DEFAULT '',
  primary_label  TEXT NOT NULL DEFAULT '',
  derived_metrics JSONB DEFAULT '[]'::jsonb,
  percentile      SMALLINT,
  percentile_label TEXT DEFAULT '',
  age_mean        DOUBLE PRECISION,
  age_mean_unit   TEXT DEFAULT '',
  is_new_pb       BOOLEAN DEFAULT false,
  previous_best   DOUBLE PRECISION,
  raw_inputs      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_football_test_results_user_date
  ON football_test_results (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_football_test_results_user_type
  ON football_test_results (user_id, test_type, created_at DESC);

-- RLS
ALTER TABLE football_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own football test results"
  ON football_test_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own football test results"
  ON football_test_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);
