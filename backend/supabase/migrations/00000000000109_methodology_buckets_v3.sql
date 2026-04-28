-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 109 — Methodology buckets + 5 new directive types (Phase 8)
-- ═══════════════════════════════════════════════════════════════════════════
-- Locks the PD methodology taxonomy at 14 buckets, each owning a disjoint
-- slice of directive types. Adds 5 new directive types so previously
-- distributed coverage areas (Sleep, Nutrition, Mental Health, Injuries,
-- Career) become first-class buckets — eliminating cross-bucket conflicts
-- by construction.
--
-- New directive types:
--   27. sleep_policy       — sleep windows, hygiene, alarms, debt rules
--   28. nutrition_policy   — what to recommend, when to fuel, hydration
--   29. wellbeing_policy   — mental health & performance (mood, mindset,
--                            burnout, focus, motivation)
--   30. injury_policy      — active-injury handling + return-to-play
--   31. career_policy      — CV/recruitment/scholarship guidance
--
-- Adds a `bucket` column to methodology_documents so the parser only emits
-- directive types in the bucket's allowed set, and the PD sees a clean
-- partition in the CMS.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Extend the directive_type CHECK constraint ───────────────────────────
ALTER TABLE public.methodology_directives
  DROP CONSTRAINT IF EXISTS methodology_directives_directive_type_check;

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
    'dashboard_section', 'signal_definition', 'program_rule',
    -- Phase 8: Bucketed verticals
    'sleep_policy', 'nutrition_policy', 'wellbeing_policy',
    'injury_policy', 'career_policy'
  ));

COMMENT ON CONSTRAINT methodology_directives_directive_type_check
  ON public.methodology_directives IS
  '31 closed directive types as of Phase 8. New types must be added in concert with Zod (backend/lib/validation/admin/directiveSchemas.ts) and runtime resolvers.';

-- ─── 2. Add bucket field on methodology_documents ────────────────────────────
ALTER TABLE public.methodology_documents
  ADD COLUMN IF NOT EXISTS bucket TEXT;

ALTER TABLE public.methodology_documents
  DROP CONSTRAINT IF EXISTS methodology_documents_bucket_check;

ALTER TABLE public.methodology_documents
  ADD CONSTRAINT methodology_documents_bucket_check
  CHECK (bucket IS NULL OR bucket IN (
    'voice',
    'safety',
    'training_science',
    'calendar',
    'programs',
    'knowledge_memory',
    'athlete_dashboard',
    'coach_parent',
    'nutrition',
    'routing',
    'wellbeing',
    'injury',
    'career',
    'sleep'
  ));

COMMENT ON COLUMN public.methodology_documents.bucket IS
  'Optional methodology bucket — when set, parser restricts emitted directive types to the bucket''s allowed set, eliminating cross-bucket conflicts. Null = legacy free-form doc (still parses against all types).';

CREATE INDEX IF NOT EXISTS methodology_documents_bucket_idx
  ON public.methodology_documents (bucket);
