-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 106 — Prompt Inspector directive provenance
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the `applied_directive_ids` column to prompt_render_log so the
-- Phase 6 Prompt Inspector can show which methodology directives fired
-- for each rendered prompt block.
--
-- Shape:  { block_name: ["directive-uuid", ...], ... }
--   e.g.  { "identity": ["00000000-…-aaa1"], "tone": ["…-bb02"] }
--
-- The runtime resolver (ai-service/app/instructions/resolver.py) emits
-- the ids it returned to each consumer; the prompt_render_logger persists
-- them; the inspector fetches them and joins to methodology_directives /
-- methodology_documents to show source quotes.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.prompt_render_log
  ADD COLUMN IF NOT EXISTS applied_directive_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.prompt_render_log.applied_directive_ids IS
  'Map of {block_name: [directive_id, ...]} — which methodology directives drove each rendered block in this turn. Empty object when no directives applied (legacy/seed-only). Used by the Prompt Inspector for provenance.';

-- Optional index for filtering inspector queries by directive id (e.g. "show
-- me every prompt that used directive X"). Cheap to add now while the table
-- is small.
CREATE INDEX IF NOT EXISTS prompt_render_log_directive_ids_idx
  ON public.prompt_render_log USING GIN (applied_directive_ids);
