-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 108 — One-shot legacy → methodology data migration (Phase 7.0a)
-- ═══════════════════════════════════════════════════════════════════════════
-- Copies every row from the three legacy PD tables into matching
-- methodology_directives rows, all in status = 'published', then writes
-- a single live methodology_publish_snapshots row containing the full
-- set so the resolver picks them up at flip time.
--
-- Source tables:
--   • dashboard_sections   →  directive_type = 'dashboard_section'
--   • pd_signals           →  directive_type = 'signal_definition'
--   • pd_program_rules     →  directive_type = 'program_rule'
--
-- Idempotency: every INSERT is guarded by WHERE NOT EXISTS on a unique
-- key in the directive's payload (`section_key`, `signal_key`,
-- `rule_name` respectively). Re-running this migration is a no-op once
-- the migration has succeeded once. The snapshot creation also clears
-- any prior live snapshot whose label starts with 'phase-7-cutover-'
-- before re-creating one with the up-to-date directive set.
--
-- This migration ONLY copies data. The runtime cutover (Phase 7.2 + 7.3)
-- happens separately in TS code; until that ships, both legacy reads
-- and methodology directives are present, which is fine because the
-- code still reads from the legacy tables.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. dashboard_sections → methodology_directives ──────────────────────

INSERT INTO public.methodology_directives (
  directive_type, audience, sport_scope, age_scope, phv_scope,
  position_scope, mode_scope, priority, payload, source_excerpt,
  status, change_reason
)
SELECT
  'dashboard_section'::TEXT,
  'athlete'::TEXT,
  COALESCE(ds.sport_filter, ARRAY[]::TEXT[]),
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  COALESCE(ds.sort_order, 100)::SMALLINT,
  jsonb_build_object(
    'section_key',          ds.section_key,
    'display_name',         ds.display_name,
    'component_type',       ds.component_type,
    'panel_key',            COALESCE(ds.panel_key, 'main'),
    'sort_order',           COALESCE(ds.sort_order, 100),
    'metric_key',           NULL,
    'coaching_text_template', ds.coaching_text,
    'config',               COALESCE(ds.config, '{}'::jsonb),
    'is_enabled',           ds.is_enabled
  ),
  'Migrated from legacy dashboard_sections row "' || ds.section_key || '"',
  'published'::TEXT,
  'phase-7 legacy migration'
FROM public.dashboard_sections ds
WHERE NOT EXISTS (
  SELECT 1 FROM public.methodology_directives md
  WHERE md.directive_type = 'dashboard_section'
    AND md.payload->>'section_key' = ds.section_key
);


-- ─── 2. pd_signals → methodology_directives ─────────────────────────────

INSERT INTO public.methodology_directives (
  directive_type, audience, sport_scope, age_scope, phv_scope,
  position_scope, mode_scope, priority, payload, source_excerpt,
  status, change_reason
)
SELECT
  'signal_definition'::TEXT,
  'athlete'::TEXT,
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  COALESCE(s.priority, 100)::SMALLINT,
  jsonb_build_object(
    'signal_key',            s.key,
    'display_name',          s.display_name,
    'subtitle',              s.subtitle,
    'conditions',            COALESCE(s.conditions, jsonb_build_object('match','all','conditions','[]'::jsonb)),
    'color',                 s.color,
    'hero_background',       s.hero_background,
    'arc_opacity',           CASE
                               WHEN jsonb_typeof(s.arc_opacity) = 'number'
                               THEN (s.arc_opacity)::TEXT::NUMERIC
                               ELSE NULL
                             END,
    'pill_background',       s.pill_background,
    'bar_rgba',              s.bar_rgba,
    'coaching_color',        s.coaching_color,
    'coaching_text_template', s.coaching_text,
    'pill_config',           COALESCE(s.pill_config, '[]'::jsonb),
    'trigger_config',        COALESCE(s.trigger_config, '[]'::jsonb),
    'adapted_plan_name',     s.adapted_plan_name,
    'adapted_plan_meta',     CASE
                               WHEN s.adapted_plan_meta IS NULL THEN NULL
                               ELSE jsonb_build_object('raw', s.adapted_plan_meta)
                             END,
    'show_urgency_badge',    COALESCE(s.show_urgency_badge, FALSE),
    'urgency_label',         s.urgency_label,
    'is_enabled',            COALESCE(s.is_enabled, TRUE)
  ),
  'Migrated from legacy pd_signals row "' || s.key || '"',
  'published'::TEXT,
  'phase-7 legacy migration'
FROM public.pd_signals s
WHERE NOT EXISTS (
  SELECT 1 FROM public.methodology_directives md
  WHERE md.directive_type = 'signal_definition'
    AND md.payload->>'signal_key' = s.key
);


-- ─── 3. pd_program_rules → methodology_directives ──────────────────────

INSERT INTO public.methodology_directives (
  directive_type, audience, sport_scope, age_scope, phv_scope,
  position_scope, mode_scope, priority, payload, source_excerpt,
  status, change_reason
)
SELECT
  'program_rule'::TEXT,
  'athlete'::TEXT,
  COALESCE(r.sport_filter, ARRAY[]::TEXT[]),
  COALESCE(r.age_band_filter, ARRAY[]::TEXT[]),
  COALESCE(r.phv_filter, ARRAY[]::TEXT[]),
  COALESCE(r.position_filter, ARRAY[]::TEXT[]),
  ARRAY[]::TEXT[],
  COALESCE(r.priority, 100)::SMALLINT,
  jsonb_build_object(
    'rule_name',                r.name,
    'description',              r.description,
    'category',                 r.category,
    'conditions',               r.conditions,
    'mandatory_programs',       COALESCE(r.mandatory_programs,    ARRAY[]::TEXT[]),
    'blocked_programs',         COALESCE(r.blocked_programs,      ARRAY[]::TEXT[]),
    'high_priority_programs',   COALESCE(r.high_priority_programs, ARRAY[]::TEXT[]),
    'prioritize_categories',    COALESCE(r.prioritize_categories, ARRAY[]::TEXT[]),
    'block_categories',         COALESCE(r.block_categories,      ARRAY[]::TEXT[]),
    'load_multiplier',          r.load_multiplier,
    'session_cap_minutes',      r.session_cap_minutes,
    'frequency_cap',            r.frequency_cap,
    'intensity_cap',            r.intensity_cap,
    'ai_guidance_text',         r.ai_guidance_text,
    'safety_critical',          COALESCE(r.safety_critical, FALSE),
    'evidence_source',          r.evidence_source,
    'evidence_grade',           r.evidence_grade,
    'is_enabled',               COALESCE(r.is_enabled, TRUE)
  ),
  'Migrated from legacy pd_program_rules row "' || r.name || '"',
  'published'::TEXT,
  'phase-7 legacy migration'
FROM public.pd_program_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM public.methodology_directives md
  WHERE md.directive_type = 'program_rule'
    AND md.payload->>'rule_name' = r.name
);


-- ─── 4. Snapshot the migrated set ──────────────────────────────────────
-- Build a fresh live snapshot containing ALL approved/published directives
-- (the prior 1-3 just emitted inserts; this also captures any directives
-- that were already there from Phases 1-6).

DO $migrate$
DECLARE
  v_snap_id UUID := gen_random_uuid();
  v_directives JSONB;
  v_count INT;
BEGIN
  -- Build the directive set (everything published).
  SELECT
    COALESCE(jsonb_agg(to_jsonb(md.*)), '[]'::jsonb),
    COUNT(*)::INT
  INTO v_directives, v_count
  FROM public.methodology_directives md
  WHERE md.status IN ('approved', 'published');

  -- Clear any prior live snapshot.
  UPDATE public.methodology_publish_snapshots
     SET is_live = FALSE, retired_at = NOW()
   WHERE is_live = TRUE;

  -- Insert the new live snapshot.
  INSERT INTO public.methodology_publish_snapshots (
    id, label, notes, directives, directive_count,
    schema_version, is_live, published_at
  ) VALUES (
    v_snap_id,
    'phase-7-cutover-' || to_char(NOW(), 'YYYY-MM-DD-HH24MI'),
    'Phase 7 cutover snapshot — auto-generated from the legacy → methodology migration. Replace this label after you publish your first PD-authored snapshot in the CMS.',
    v_directives,
    v_count,
    1,
    TRUE,
    NOW()
  );

  RAISE NOTICE 'Phase 7 snapshot created: % with % directives', v_snap_id, v_count;
END
$migrate$;
