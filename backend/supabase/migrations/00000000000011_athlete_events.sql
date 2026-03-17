-- ============================================================================
-- Migration 011: Athlete Events — Layer 1 of the Athlete Data Fabric
-- Append-only immutable event stream. Every athlete action recorded here.
-- UI never reads from this table directly — only via athlete_snapshots (Layer 2).
-- ============================================================================

-- Core event table
CREATE TABLE public.athlete_events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('WEARABLE', 'MANUAL', 'SYSTEM', 'COACH', 'PARENT')),
  payload         JSONB NOT NULL DEFAULT '{}',
  created_by      UUID NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  correction_of   UUID REFERENCES public.athlete_events(event_id)
);

-- Row-level security
ALTER TABLE public.athlete_events ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own events
CREATE POLICY "Athletes read own events"
  ON public.athlete_events FOR SELECT
  USING (auth.uid() = athlete_id);

-- Coaches/parents can read events of linked athletes
CREATE POLICY "Guardians read linked athlete events"
  ON public.athlete_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.relationships
      WHERE guardian_id = auth.uid()
        AND player_id = public.athlete_events.athlete_id
        AND status = 'accepted'
    )
  );

-- Athletes insert their own events
CREATE POLICY "Athletes insert own events"
  ON public.athlete_events FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

-- Coaches/parents can insert events for linked athletes
CREATE POLICY "Guardians insert events for linked athletes"
  ON public.athlete_events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.relationships
      WHERE guardian_id = auth.uid()
        AND player_id = public.athlete_events.athlete_id
        AND status = 'accepted'
    )
  );

-- Primary access pattern: athlete timeline (most recent first)
CREATE INDEX idx_events_athlete_time
  ON public.athlete_events (athlete_id, occurred_at DESC);

-- Event-type filtered queries (e.g., all SESSION_LOGs for ACWR)
CREATE INDEX idx_events_type
  ON public.athlete_events (athlete_id, event_type, occurred_at DESC);

-- Bulk time-range exports (CV generation, analytics) — BRIN is cheap for append-only
CREATE INDEX idx_events_created_brin
  ON public.athlete_events USING brin(created_at);

-- Correction chain lookups
CREATE INDEX idx_events_correction
  ON public.athlete_events (correction_of)
  WHERE correction_of IS NOT NULL;

-- Grant service role full access (event processor runs as admin)
GRANT ALL ON public.athlete_events TO service_role;
