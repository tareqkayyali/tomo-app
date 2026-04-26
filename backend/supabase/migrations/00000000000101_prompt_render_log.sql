-- Migration 101: prompt_render_log
-- Records the full prompt assembly outcome for each AI-routed chat turn.
-- Sink for the Phase 4 CMS "See What the Coach Saw" inspector.
-- Write path: ai-service prompt_render_logger.py (fire-and-forget).

BEGIN;

CREATE TABLE IF NOT EXISTS public.prompt_render_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  athlete_id UUID NOT NULL,
  session_id UUID NOT NULL,
  turn_index INT NOT NULL,
  agent_type TEXT NOT NULL,
  intent_id TEXT,
  blocks JSONB NOT NULL DEFAULT '{}'::jsonb,
  static_tokens INT NOT NULL DEFAULT 0,
  dynamic_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  memory_facts_count INT,
  memory_available BOOLEAN NOT NULL DEFAULT FALSE,
  validation_warnings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prompt_render_log_athlete_created
  ON public.prompt_render_log (athlete_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prompt_render_log_session_turn
  ON public.prompt_render_log (session_id, turn_index);
CREATE INDEX IF NOT EXISTS prompt_render_log_created
  ON public.prompt_render_log (created_at DESC);

ALTER TABLE public.prompt_render_log ENABLE ROW LEVEL SECURITY;

-- Service role writes (ai-service); admin role reads via CMS.
CREATE POLICY "prompt_render_log_admin_read"
  ON public.prompt_render_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "prompt_render_log_service_write"
  ON public.prompt_render_log
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

COMMENT ON TABLE public.prompt_render_log IS
  'Per-turn record of the system prompt assembled for each AI chat turn. Source for Phase 4 CMS inspector. 30-day retention enforced by pg_cron in a later migration.';
COMMENT ON COLUMN public.prompt_render_log.blocks IS
  'JSONB map of {section_name: rendered_text} for each Block 2 dynamic section. Used by CMS to render plain-English "What the Coach Saw" view.';
COMMENT ON COLUMN public.prompt_render_log.validation_warnings IS
  'Soft warnings from validate_safety_sections (hard violations throw and never reach this row).';

COMMIT;
