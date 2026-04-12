-- CCRS: Cascading Confidence Readiness Score
-- Adds: ccrs_scores audit log, snapshot extensions for baseline quality + CCRS output

-- ---------------------------------------------------------------------------
-- 1. ccrs_scores — Append-only CCRS computation log (one per athlete per day)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ccrs_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  session_date      date NOT NULL DEFAULT CURRENT_DATE,

  -- Output
  ccrs              numeric(5,2) NOT NULL CHECK (ccrs >= 0 AND ccrs <= 100),
  confidence        text NOT NULL CHECK (confidence IN (
                      'very_high','high','medium','low','estimated')),
  recommendation    text NOT NULL CHECK (recommendation IN (
                      'full_load','moderate','reduced','recovery','blocked')),

  -- Component scores (stored for auditability)
  biometric_score     numeric(5,2),
  hooper_score        numeric(5,2),
  historical_score    numeric(5,2),
  acwr_value          numeric(5,3),
  acwr_multiplier     numeric(4,3),
  phv_multiplier      numeric(4,3),
  freshness_mult      numeric(4,3),

  -- Weight breakdown (must sum to 1.0)
  weight_biometric    numeric(4,3),
  weight_hooper       numeric(4,3),
  weight_historical   numeric(4,3),
  weight_coach        numeric(4,3),

  -- Active alert flags
  alert_flags         text[] DEFAULT '{}',

  -- Data source audit
  bio_data_age_hours  numeric(6,2),

  UNIQUE(athlete_id, session_date)
);

-- ---------------------------------------------------------------------------
-- 2. RLS for ccrs_scores
-- ---------------------------------------------------------------------------

ALTER TABLE ccrs_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athlete_own_ccrs" ON ccrs_scores
  FOR ALL USING (athlete_id = auth.uid());

CREATE POLICY "coach_read_ccrs" ON ccrs_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM relationships r
      WHERE r.player_id = ccrs_scores.athlete_id
        AND r.guardian_id = auth.uid()
        AND r.status = 'accepted'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ccrs_athlete_date
  ON ccrs_scores(athlete_id, session_date DESC);

-- ---------------------------------------------------------------------------
-- 4. Extend athlete_snapshots with baseline quality + CCRS output
-- ---------------------------------------------------------------------------

-- Baseline quality fields (for cold start detection)
ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS hrv_sd_30d numeric(6,2),
  ADD COLUMN IF NOT EXISTS hrv_sample_n int DEFAULT 0;

-- CCRS output fields (latest score cached on snapshot)
ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS ccrs numeric(5,2),
  ADD COLUMN IF NOT EXISTS ccrs_confidence text,
  ADD COLUMN IF NOT EXISTS ccrs_recommendation text,
  ADD COLUMN IF NOT EXISTS ccrs_alert_flags text[] DEFAULT '{}';

-- Data freshness tier (FRESH/AGING/STALE/UNKNOWN)
ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS data_freshness text DEFAULT 'UNKNOWN';

-- Add check constraint separately (IF NOT EXISTS not supported for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athlete_snapshots_data_freshness_check'
  ) THEN
    ALTER TABLE athlete_snapshots
      ADD CONSTRAINT athlete_snapshots_data_freshness_check
      CHECK (data_freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN'));
  END IF;
END $$;
