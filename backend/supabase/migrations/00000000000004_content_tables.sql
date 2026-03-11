-- ═══════════════════════════════════════════════════════════════════════
-- Content Tables — Global sport/content data (no RLS)
-- Replaces hardcoded TypeScript constants with database-driven content.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Sports
CREATE TABLE IF NOT EXISTS public.sports (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  icon        text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#FF6B35',
  sort_order  int NOT NULL DEFAULT 0,
  available   boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sports IS 'Available sports in the platform';

-- 2. Sport Attributes (6 per sport — e.g. pace/shooting/… or power/reflexes/…)
CREATE TABLE IF NOT EXISTS public.sport_attributes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id        text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  key             text NOT NULL,
  label           text NOT NULL,
  full_name       text NOT NULL,
  abbreviation    text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  color           text NOT NULL DEFAULT '#888888',
  max_value       int NOT NULL DEFAULT 99,
  sort_order      int NOT NULL DEFAULT 0,
  sub_attributes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, key)
);

COMMENT ON TABLE public.sport_attributes IS 'Attribute definitions per sport (e.g. pace, shooting for football)';

-- 3. Sport Skills (8 per sport — e.g. free_kicks or bandeja)
CREATE TABLE IF NOT EXISTS public.sport_skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id        text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  key             text NOT NULL,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  icon            text NOT NULL DEFAULT '',
  sort_order      int NOT NULL DEFAULT 0,
  sub_metrics     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, key)
);

COMMENT ON TABLE public.sport_skills IS 'Skill definitions per sport (e.g. free_kicks, bandeja)';

-- 4. Sport Positions (7 football + padel positions if any)
CREATE TABLE IF NOT EXISTS public.sport_positions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id          text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  key               text NOT NULL,
  label             text NOT NULL,
  sort_order        int NOT NULL DEFAULT 0,
  attribute_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, key)
);

COMMENT ON TABLE public.sport_positions IS 'Position definitions with attribute weight matrices';

-- 5. Sport Rating Levels (10 per sport)
CREATE TABLE IF NOT EXISTS public.sport_rating_levels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id        text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  name            text NOT NULL,
  min_rating      int NOT NULL,
  max_rating      int NOT NULL,
  description     text NOT NULL DEFAULT '',
  color           text NOT NULL DEFAULT '#888888',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, name)
);

COMMENT ON TABLE public.sport_rating_levels IS 'Rating pathway tiers per sport';

-- 6. Sport Test Definitions (8 football physical tests)
CREATE TABLE IF NOT EXISTS public.sport_test_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id        text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  test_id         text NOT NULL,
  name            text NOT NULL,
  icon            text NOT NULL DEFAULT '',
  color           text NOT NULL DEFAULT '#888888',
  description     text NOT NULL DEFAULT '',
  research_note   text NOT NULL DEFAULT '',
  attribute_keys  jsonb NOT NULL DEFAULT '[]'::jsonb,
  inputs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  derived_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_metric_name text NOT NULL DEFAULT '',
  primary_input_key   text NOT NULL DEFAULT '',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, test_id)
);

COMMENT ON TABLE public.sport_test_definitions IS 'Physical test definitions with inputs and derived metrics';

-- 7. Sport Normative Data (42 football metrics × age range)
CREATE TABLE IF NOT EXISTS public.sport_normative_data (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id        text NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  metric_name     text NOT NULL,
  unit            text NOT NULL DEFAULT '',
  attribute_key   text NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('higher', 'lower')),
  age_min         int NOT NULL DEFAULT 13,
  age_max         int NOT NULL DEFAULT 23,
  means           jsonb NOT NULL DEFAULT '[]'::jsonb,
  sds             jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, metric_name)
);

COMMENT ON TABLE public.sport_normative_data IS 'Age-based normative data (means/SDs) for physical metrics';

-- 8. Content Items (quotes, onboarding, drills, milestones, phone tests, etc.)
CREATE TABLE IF NOT EXISTS public.content_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL,
  subcategory     text NOT NULL DEFAULT '',
  sport_id        text REFERENCES public.sports(id) ON DELETE SET NULL,
  key             text NOT NULL DEFAULT '',
  sort_order      int NOT NULL DEFAULT 0,
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_category
  ON public.content_items (category, subcategory, sport_id);

COMMENT ON TABLE public.content_items IS 'Miscellaneous content: quotes, onboarding options, drills, milestones';

-- ═══ Auto-update updated_at triggers ═══

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sports', 'sport_attributes', 'sport_skills', 'sport_positions',
    'sport_rating_levels', 'sport_test_definitions', 'sport_normative_data',
    'content_items'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I; '
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- ═══ Content Manifest Function ═══
-- Returns per-table MD5 hashes for cache invalidation.

CREATE OR REPLACE FUNCTION public.content_manifest()
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'sports',                 md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sports), '')),
    'sport_attributes',       md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_attributes), '')),
    'sport_skills',           md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_skills), '')),
    'sport_positions',        md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_positions), '')),
    'sport_rating_levels',    md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_rating_levels), '')),
    'sport_test_definitions', md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_test_definitions), '')),
    'sport_normative_data',   md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.sport_normative_data), '')),
    'content_items',          md5(coalesce((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.content_items), ''))
  );
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION public.content_manifest IS 'Returns MD5 hashes per content table for cache invalidation';

-- ═══ No RLS — these are global, read-only content tables ═══
-- RLS is intentionally NOT enabled on content tables.
-- API endpoints will handle read-only access without auth.

-- ═══ GRANT SELECT so PostgREST exposes tables in schema cache ═══
GRANT SELECT ON public.sports TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_attributes TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_skills TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_positions TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_rating_levels TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_test_definitions TO anon, authenticated, service_role;
GRANT SELECT ON public.sport_normative_data TO anon, authenticated, service_role;
GRANT SELECT ON public.content_items TO anon, authenticated, service_role;
