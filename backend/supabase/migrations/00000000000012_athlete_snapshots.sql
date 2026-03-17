-- ============================================================================
-- Migration 012: Athlete Snapshots — Layer 2 of the Athlete Data Fabric
-- Single pre-computed document per athlete. Every UI component reads from here.
-- Updated by the event processor after every Layer 1 insert.
-- ============================================================================

CREATE TABLE public.athlete_snapshots (
  -- Identity
  athlete_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Core profile (changes rarely)
  dob                 DATE,
  sport               TEXT,
  position            TEXT,
  academic_year       INT,

  -- PHV (Peak Height Velocity)
  phv_stage           TEXT CHECK (phv_stage IN ('PRE', 'CIRCA', 'POST')),
  phv_offset_years    DECIMAL(4,2),
  height_cm           DECIMAL(5,1),
  weight_kg           DECIMAL(5,1),

  -- Today's readiness (recomputed daily / on new wearable sync)
  readiness_score     INT CHECK (readiness_score BETWEEN 0 AND 100),
  hrv_baseline_ms     DECIMAL(6,1),
  hrv_today_ms        DECIMAL(6,1),
  resting_hr_bpm      INT,
  sleep_quality       DECIMAL(3,1),
  injury_risk_flag    TEXT CHECK (injury_risk_flag IN ('GREEN', 'AMBER', 'RED')),
  readiness_rag       TEXT CHECK (readiness_rag IN ('GREEN', 'AMBER', 'RED')),

  -- Load metrics (Angle 1 + 2)
  acwr                DECIMAL(4,2),
  atl_7day            DECIMAL(8,1),
  ctl_28day           DECIMAL(8,1),
  dual_load_index     INT CHECK (dual_load_index BETWEEN 0 AND 100),
  academic_load_7day  INT,
  athletic_load_7day  DECIMAL(8,1),

  -- Accumulated performance (Angle 3 — CV)
  sessions_total      INT NOT NULL DEFAULT 0,
  training_age_weeks  INT NOT NULL DEFAULT 0,
  streak_days         INT NOT NULL DEFAULT 0,
  cv_completeness     INT CHECK (cv_completeness BETWEEN 0 AND 100),
  mastery_scores      JSONB NOT NULL DEFAULT '{}',
  strength_benchmarks JSONB NOT NULL DEFAULT '{}',
  speed_profile       JSONB NOT NULL DEFAULT '{}',
  coachability_index  DECIMAL(4,1),

  -- Wellness trend (Angle 4 — Triangle visibility)
  wellness_7day_avg   DECIMAL(3,1),
  wellness_trend      TEXT CHECK (wellness_trend IN ('IMPROVING', 'STABLE', 'DECLINING')),
  triangle_rag        TEXT CHECK (triangle_rag IN ('GREEN', 'AMBER', 'RED')),

  -- Meta
  last_event_id       UUID REFERENCES public.athlete_events(event_id),
  last_session_at     TIMESTAMPTZ,
  last_checkin_at     TIMESTAMPTZ
);

-- Row-level security
ALTER TABLE public.athlete_snapshots ENABLE ROW LEVEL SECURITY;

-- Athletes read their own snapshot
CREATE POLICY "Athletes read own snapshot"
  ON public.athlete_snapshots FOR SELECT
  USING (athlete_id = auth.uid());

-- Coaches read linked athlete snapshots
CREATE POLICY "Coaches read linked athlete snapshots"
  ON public.athlete_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.relationships
      WHERE guardian_id = auth.uid()
        AND player_id = public.athlete_snapshots.athlete_id
        AND status = 'accepted'
    )
  );

-- Only service role (event processor) writes snapshots
GRANT ALL ON public.athlete_snapshots TO service_role;

-- Enable Realtime for Triangle live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.athlete_snapshots;
