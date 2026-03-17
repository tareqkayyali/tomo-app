-- ============================================================================
-- Migration 013: Athlete Daily Load — ACWR Pre-Aggregation
-- One row per athlete per day. UPSERTed by event processor on SESSION_LOG
-- and ACADEMIC_EVENT inserts. ACWR becomes a 28-row scan instead of full
-- event table scan.
-- ============================================================================

CREATE TABLE public.athlete_daily_load (
  athlete_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  load_date         DATE NOT NULL,
  training_load_au  DECIMAL(8,1) NOT NULL DEFAULT 0,
  academic_load_au  DECIMAL(8,1) NOT NULL DEFAULT 0,
  session_count     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (athlete_id, load_date)
);

-- Row-level security
ALTER TABLE public.athlete_daily_load ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own load data
CREATE POLICY "Athletes read own daily load"
  ON public.athlete_daily_load FOR SELECT
  USING (auth.uid() = athlete_id);

-- Coaches can read linked athlete load data (for load monitoring dashboard)
CREATE POLICY "Coaches read linked athlete daily load"
  ON public.athlete_daily_load FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.relationships
      WHERE guardian_id = auth.uid()
        AND player_id = public.athlete_daily_load.athlete_id
        AND status = 'accepted'
    )
  );

-- Only service role (event processor) writes
GRANT ALL ON public.athlete_daily_load TO service_role;
