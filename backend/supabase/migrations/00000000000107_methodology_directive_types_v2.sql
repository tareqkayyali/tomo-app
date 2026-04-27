-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 107 — Methodology directive types v2 (Phase 7)
-- ═══════════════════════════════════════════════════════════════════════════
-- Extends `methodology_directives.directive_type` CHECK constraint to add
-- three new types covering Dashboard + Programs governance:
--
--   24. dashboard_section     — what dashboard cards appear, in what order,
--                               for which scope (athlete profile)
--   25. signal_definition     — hero-layer alerts (the colored block at the
--                               top of the dashboard)
--   26. program_rule          — program-recommendation rules (mandatory,
--                               blocked, load multiplier, etc.)
--
-- Phase 7.0a then runs a one-shot data migration that copies every row
-- from the legacy tables (dashboard_sections, pd_signals, pd_program_rules)
-- into matching methodology_directives rows. This migration only loosens
-- the constraint; no data is touched.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the old CHECK constraint by name. Postgres auto-named it
-- `methodology_directives_directive_type_check` when the table was created.
ALTER TABLE public.methodology_directives
  DROP CONSTRAINT IF EXISTS methodology_directives_directive_type_check;

-- Re-add with the v2 set (23 originals + 3 new).
ALTER TABLE public.methodology_directives
  ADD CONSTRAINT methodology_directives_directive_type_check
  CHECK (directive_type IN (
    -- Identity & Voice
    'identity', 'tone', 'response_shape',
    -- Safety & Guardrails
    'guardrail_phv', 'guardrail_age', 'guardrail_load', 'safety_gate',
    -- Decision Logic
    'threshold', 'performance_model', 'mode_definition',
    'planning_policy', 'scheduling_policy',
    -- Routing & Recommendations
    'routing_intent', 'routing_classifier', 'recommendation_policy',
    'rag_policy', 'memory_policy',
    -- Surface & Cross-Audience
    'surface_policy', 'escalation',
    'coach_dashboard_policy', 'parent_report_policy',
    -- Meta
    'meta_parser', 'meta_conflict',
    -- Phase 7: Dashboard + Programs governance
    'dashboard_section', 'signal_definition', 'program_rule'
  ));

COMMENT ON CONSTRAINT methodology_directives_directive_type_check
  ON public.methodology_directives IS
  '26 closed directive types as of Phase 7. New types must be added in concert with Zod (backend/lib/validation/admin/directiveSchemas.ts) + Pydantic (ai-service/app/instructions/types.py) schemas.';
