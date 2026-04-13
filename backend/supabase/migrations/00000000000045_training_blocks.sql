-- Migration 045: Training Blocks (Periodization)
--
-- Stores mesocycle blocks for periodized training.
-- Phases: general_prep → specific_prep → competition → transition
-- Referenced by training_program_tools.py (Sprint 4 agent layer).

-- Drop partial table from failed first run (FK to non-existent "programs" table)
DROP TABLE IF EXISTS training_blocks CASCADE;

CREATE TABLE training_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phase         text NOT NULL CHECK (phase IN ('general_prep', 'specific_prep', 'competition', 'transition')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  duration_weeks integer NOT NULL CHECK (duration_weeks BETWEEN 1 AND 16),
  week_number   integer NOT NULL DEFAULT 1,
  program_id    uuid,  -- references football_training_programs; no FK constraint (table may be seeded separately)
  goals         jsonb,
  load_targets  jsonb,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  phase_transitioned_at timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_training_blocks_user_status
  ON training_blocks(user_id, status);

CREATE INDEX IF NOT EXISTS idx_training_blocks_user_dates
  ON training_blocks(user_id, start_date, end_date);

-- RLS
ALTER TABLE training_blocks ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own blocks
CREATE POLICY training_blocks_select_own
  ON training_blocks FOR SELECT
  USING (auth.uid() = user_id);

-- Athletes can insert their own blocks
CREATE POLICY training_blocks_insert_own
  ON training_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Athletes can update their own blocks
CREATE POLICY training_blocks_update_own
  ON training_blocks FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass (for agent bridge routes)
CREATE POLICY training_blocks_service_role
  ON training_blocks FOR ALL
  USING (auth.role() = 'service_role');

-- Also add athlete_achievements table for CV agent (Sprint 3)
CREATE TABLE IF NOT EXISTS athlete_achievements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  category            text NOT NULL CHECK (category IN (
    'competition', 'personal_best', 'team_selection',
    'certification', 'academic', 'leadership', 'community'
  )),
  description         text,
  date_achieved       date NOT NULL DEFAULT CURRENT_DATE,
  evidence_url        text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending', 'verified', 'rejected')
  ),
  verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_achievements_user
  ON athlete_achievements(user_id, category);

CREATE INDEX IF NOT EXISTS idx_athlete_achievements_status
  ON athlete_achievements(user_id, verification_status);

ALTER TABLE athlete_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_achievements_select_own
  ON athlete_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY athlete_achievements_insert_own
  ON athlete_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY athlete_achievements_update_own
  ON athlete_achievements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY athlete_achievements_service_role
  ON athlete_achievements FOR ALL
  USING (auth.role() = 'service_role');

-- Add columns to profiles for recruitment visibility (CV agent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS recruitment_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recruitment_visibility_level text DEFAULT 'private'
    CHECK (recruitment_visibility_level IN ('private', 'coaches_only', 'public'));

-- Add academic stress columns to athlete_snapshot (Dual-Load agent)
-- Using DO block since athlete_snapshot may have varying schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'athlete_snapshot' AND column_name = 'academic_stress_level'
  ) THEN
    ALTER TABLE athlete_snapshot
      ADD COLUMN academic_stress_level integer CHECK (academic_stress_level BETWEEN 1 AND 10),
      ADD COLUMN academic_stress_notes text;
  END IF;
END $$;

-- Add cognitive_windows reference table for Dual-Load agent
CREATE TABLE IF NOT EXISTS cognitive_windows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_type     text NOT NULL UNIQUE,
  label           text NOT NULL,
  optimal_delay_minutes integer NOT NULL,
  duration_minutes      integer NOT NULL DEFAULT 90,
  description     text,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed cognitive window types
INSERT INTO cognitive_windows (window_type, label, optimal_delay_minutes, duration_minutes, description)
VALUES
  ('post_cardio', 'Post-Cardio Study', 30, 90, 'Elevated BDNF after aerobic exercise enhances memory consolidation'),
  ('post_strength', 'Post-Strength Study', 45, 75, 'Moderate window — cortisol elevated, wait longer before complex study'),
  ('post_hiit', 'Post-HIIT Study', 60, 60, 'High cortisol requires longer cooldown before cognitive tasks'),
  ('morning_fresh', 'Morning Fresh', 0, 120, 'Pre-training morning window — highest cognitive baseline'),
  ('evening_review', 'Evening Review', 0, 60, 'Low-intensity review before sleep — consolidation benefit'),
  ('rest_day', 'Rest Day Deep Study', 0, 180, 'Full cognitive capacity on rest days — ideal for complex material')
ON CONFLICT (window_type) DO NOTHING;

ALTER TABLE cognitive_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY cognitive_windows_read_all
  ON cognitive_windows FOR SELECT
  USING (true);

CREATE POLICY cognitive_windows_service_role
  ON cognitive_windows FOR ALL
  USING (auth.role() = 'service_role');
