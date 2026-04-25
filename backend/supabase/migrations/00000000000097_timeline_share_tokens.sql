-- ============================================================================
-- Migration 097: timeline_share_tokens
-- Persisted tokens for "Export Timeline as PDF". One row per export request.
-- Token is the public URL key; user_id owns it; range + types determine the
-- rendered grid. Re-openable until user revokes.
-- Idempotent. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timeline_share_tokens (
  token            TEXT        PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_date        DATE        NOT NULL,
  to_date          DATE        NOT NULL,
  event_types      TEXT[]      NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at   TIMESTAMPTZ,
  view_count       INT         NOT NULL DEFAULT 0,
  CONSTRAINT timeline_share_tokens_range_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_timeline_share_tokens_user_created
  ON public.timeline_share_tokens (user_id, created_at DESC);

ALTER TABLE public.timeline_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeline_share_tokens_owner_select" ON public.timeline_share_tokens;
CREATE POLICY "timeline_share_tokens_owner_select"
  ON public.timeline_share_tokens
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "timeline_share_tokens_owner_insert" ON public.timeline_share_tokens;
CREATE POLICY "timeline_share_tokens_owner_insert"
  ON public.timeline_share_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "timeline_share_tokens_owner_update" ON public.timeline_share_tokens;
CREATE POLICY "timeline_share_tokens_owner_update"
  ON public.timeline_share_tokens
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "timeline_share_tokens_owner_delete" ON public.timeline_share_tokens;
CREATE POLICY "timeline_share_tokens_owner_delete"
  ON public.timeline_share_tokens
  FOR DELETE
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_share_tokens TO authenticated;
