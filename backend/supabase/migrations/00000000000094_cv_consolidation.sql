-- ============================================================================
-- Migration 094: Player CV Consolidation (single-flow IA)
-- ============================================================================
-- Reshapes the CV system from dual (club/university) to single flow to match
-- the new 12-screen design:
--   1. cv_profiles: add single-flow columns (ai_summary, share_slug,
--      completeness_pct, is_published, medical_consent_*, last_screening_date)
--   2. Backfill new columns from legacy Club/Uni columns
--   3. Drop legacy Club/Uni divergence from cv_profiles
--   4. Consolidate athlete_snapshots.cv_completeness_* columns
--   5. Drop cv_academic_entries (NCAA flow retired per product call)
--   6. Reshape cv_character_traits enum: community -> character, camp -> award,
--      final set = (award | leadership | language | character)
--   7. Extend cv_references with state machine (requested -> submitted ->
--      identity_verified -> published | rejected)
--   8. Drop cv_share_views.cv_type (single type now)
--   9. Create cv_injury_log for Health Status screen
--  10. Create cv_ai_summary_versions for Player Profile generation log
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. cv_profiles: add new single-flow columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_profiles
  ADD COLUMN IF NOT EXISTS ai_summary                       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_last_generated        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_status                TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS ai_summary_approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_slug                       TEXT,
  ADD COLUMN IF NOT EXISTS share_views_count                INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completeness_pct                 SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_published                     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_pdf_export_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS medical_consent_coach            BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS medical_consent_scouts_summary   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS medical_consent_raw              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_screening_date              DATE;

-- Status CHECK (idempotent: drop-if-exists then add)
ALTER TABLE public.cv_profiles
  DROP CONSTRAINT IF EXISTS cv_profiles_ai_summary_status_check;
ALTER TABLE public.cv_profiles
  ADD CONSTRAINT cv_profiles_ai_summary_status_check
  CHECK (ai_summary_status IN ('draft','approved','needs_update'));

-- Unique share_slug (partial unique index for non-null values)
DROP INDEX IF EXISTS idx_cv_profiles_share_slug_unique;
CREATE UNIQUE INDEX idx_cv_profiles_share_slug_unique
  ON public.cv_profiles (share_slug)
  WHERE share_slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill new columns from legacy Club/Uni columns (idempotent guards)
-- ---------------------------------------------------------------------------

UPDATE public.cv_profiles
SET ai_summary = COALESCE(personal_statement_club, personal_statement_uni)
WHERE ai_summary IS NULL
  AND (personal_statement_club IS NOT NULL OR personal_statement_uni IS NOT NULL);

UPDATE public.cv_profiles
SET ai_summary_last_generated = statement_last_generated
WHERE ai_summary_last_generated IS NULL
  AND statement_last_generated IS NOT NULL;

UPDATE public.cv_profiles
SET ai_summary_status = statement_status
WHERE (ai_summary_status IS NULL OR ai_summary_status = 'draft')
  AND statement_status IS NOT NULL;

UPDATE public.cv_profiles
SET share_slug = COALESCE(share_token_club, share_token_uni)
WHERE share_slug IS NULL
  AND (share_token_club IS NOT NULL OR share_token_uni IS NOT NULL);

UPDATE public.cv_profiles
SET share_views_count = COALESCE(share_club_views,0) + COALESCE(share_uni_views,0)
WHERE share_views_count = 0
  AND (COALESCE(share_club_views,0) + COALESCE(share_uni_views,0)) > 0;

UPDATE public.cv_profiles
SET completeness_pct = GREATEST(COALESCE(completeness_club_pct,0), COALESCE(completeness_uni_pct,0))
WHERE completeness_pct = 0
  AND GREATEST(COALESCE(completeness_club_pct,0), COALESCE(completeness_uni_pct,0)) > 0;

UPDATE public.cv_profiles
SET is_published = TRUE
WHERE is_published = FALSE
  AND (COALESCE(cv_club_discoverable, FALSE) OR COALESCE(cv_uni_discoverable, FALSE));

UPDATE public.cv_profiles
SET last_pdf_export_at = CASE
    WHEN last_club_export_at IS NULL THEN last_uni_export_at
    WHEN last_uni_export_at IS NULL THEN last_club_export_at
    WHEN last_club_export_at > last_uni_export_at THEN last_club_export_at
    ELSE last_uni_export_at
  END
WHERE last_pdf_export_at IS NULL
  AND (last_club_export_at IS NOT NULL OR last_uni_export_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Drop legacy Club/Uni divergence from cv_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_profiles
  DROP COLUMN IF EXISTS personal_statement_club,
  DROP COLUMN IF EXISTS personal_statement_uni,
  DROP COLUMN IF EXISTS statement_status,
  DROP COLUMN IF EXISTS statement_last_generated,
  DROP COLUMN IF EXISTS statement_data_snapshot,
  DROP COLUMN IF EXISTS trajectory_narrative,
  DROP COLUMN IF EXISTS trajectory_last_generated,
  DROP COLUMN IF EXISTS dual_role_narrative,
  DROP COLUMN IF EXISTS dual_role_last_generated,
  DROP COLUMN IF EXISTS cv_club_discoverable,
  DROP COLUMN IF EXISTS cv_uni_discoverable,
  DROP COLUMN IF EXISTS completeness_club_pct,
  DROP COLUMN IF EXISTS completeness_uni_pct,
  DROP COLUMN IF EXISTS share_token_club,
  DROP COLUMN IF EXISTS share_token_uni,
  DROP COLUMN IF EXISTS share_club_views,
  DROP COLUMN IF EXISTS share_uni_views,
  DROP COLUMN IF EXISTS last_club_export_at,
  DROP COLUMN IF EXISTS last_uni_export_at,
  DROP COLUMN IF EXISTS show_load_data;

-- ---------------------------------------------------------------------------
-- 4. athlete_snapshots: consolidate cv_completeness_* columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS cv_completeness_pct SMALLINT;

UPDATE public.athlete_snapshots
SET cv_completeness_pct = GREATEST(COALESCE(cv_completeness_club_pct,0), COALESCE(cv_completeness_uni_pct,0))
WHERE cv_completeness_pct IS NULL
  AND (cv_completeness_club_pct IS NOT NULL OR cv_completeness_uni_pct IS NOT NULL);

ALTER TABLE public.athlete_snapshots
  DROP COLUMN IF EXISTS cv_completeness_club_pct,
  DROP COLUMN IF EXISTS cv_completeness_uni_pct;

-- ---------------------------------------------------------------------------
-- 5. Drop cv_academic_entries (NCAA retired)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.cv_academic_entries CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Reshape cv_character_traits enum
--    Old: (leadership | community | language | award | camp)
--    New: (award | leadership | language | character)
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_character_traits
  DROP CONSTRAINT IF EXISTS cv_character_traits_trait_category_check;

UPDATE public.cv_character_traits
SET trait_category = 'character'
WHERE trait_category = 'community';

UPDATE public.cv_character_traits
SET trait_category = 'award'
WHERE trait_category = 'camp';

ALTER TABLE public.cv_character_traits
  ADD CONSTRAINT cv_character_traits_trait_category_check
  CHECK (trait_category IN ('award','leadership','language','character'));

-- ---------------------------------------------------------------------------
-- 7. Extend cv_references with state machine
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_references
  ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS request_token         TEXT,
  ADD COLUMN IF NOT EXISTS request_sent_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_rating      SMALLINT,
  ADD COLUMN IF NOT EXISTS submitted_note        TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_by  UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,
  ADD COLUMN IF NOT EXISTS published_at          TIMESTAMPTZ;

ALTER TABLE public.cv_references
  DROP CONSTRAINT IF EXISTS cv_references_status_check;
ALTER TABLE public.cv_references
  ADD CONSTRAINT cv_references_status_check
  CHECK (status IN ('requested','submitted','identity_verified','published','rejected'));

ALTER TABLE public.cv_references
  DROP CONSTRAINT IF EXISTS cv_references_submitted_rating_range;
ALTER TABLE public.cv_references
  ADD CONSTRAINT cv_references_submitted_rating_range
  CHECK (submitted_rating IS NULL OR submitted_rating BETWEEN 1 AND 5);

DROP INDEX IF EXISTS idx_cv_references_request_token_unique;
CREATE UNIQUE INDEX idx_cv_references_request_token_unique
  ON public.cv_references (request_token)
  WHERE request_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cv_references_status_submitted
  ON public.cv_references (status, submitted_at DESC)
  WHERE status IN ('submitted','identity_verified');

DROP POLICY IF EXISTS "Referees submit via token" ON public.cv_references;
CREATE POLICY "Referees submit via token"
  ON public.cv_references FOR UPDATE
  TO anon
  USING (status = 'requested' AND request_token IS NOT NULL)
  WITH CHECK (status IN ('requested','submitted'));

-- ---------------------------------------------------------------------------
-- 8. cv_share_views: drop cv_type (single type now)
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_share_views
  DROP CONSTRAINT IF EXISTS cv_share_views_cv_type_check;
ALTER TABLE public.cv_share_views
  DROP COLUMN IF EXISTS cv_type;

DROP POLICY IF EXISTS "Anyone can log share views" ON public.cv_share_views;
CREATE POLICY "Anyone can log share views"
  ON public.cv_share_views FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- 9. cv_injury_log (Health Status screen)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cv_injury_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body_part       TEXT NOT NULL,
  side            TEXT CHECK (side IS NULL OR side IN ('left','right','bilateral','central')),
  severity        TEXT NOT NULL CHECK (severity IN ('minor','moderate','major')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','recovering','cleared')),
  date_occurred   DATE NOT NULL,
  cleared_at      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_injury_athlete
  ON public.cv_injury_log (athlete_id, status, date_occurred DESC);

ALTER TABLE public.cv_injury_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athletes own their injury log" ON public.cv_injury_log;
CREATE POLICY "Athletes own their injury log"
  ON public.cv_injury_log FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_injury_log TO service_role;

-- ---------------------------------------------------------------------------
-- 10. cv_ai_summary_versions (Player Profile generation log)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cv_ai_summary_versions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version_number    SMALLINT NOT NULL,
  content           TEXT NOT NULL,
  generated_at      TIMESTAMPTZ DEFAULT now(),
  approved          BOOLEAN DEFAULT FALSE,
  approved_at       TIMESTAMPTZ,
  data_snapshot     JSONB,
  UNIQUE (athlete_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cv_ai_summary_versions_athlete
  ON public.cv_ai_summary_versions (athlete_id, version_number DESC);

ALTER TABLE public.cv_ai_summary_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athletes read their ai summary versions" ON public.cv_ai_summary_versions;
CREATE POLICY "Athletes read their ai summary versions"
  ON public.cv_ai_summary_versions FOR SELECT
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_ai_summary_versions TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Service role grants on new tables
-- ---------------------------------------------------------------------------

GRANT ALL ON public.cv_injury_log          TO service_role;
GRANT ALL ON public.cv_ai_summary_versions TO service_role;
GRANT SELECT, INSERT ON public.cv_share_views TO anon;
GRANT UPDATE (status, submitted_rating, submitted_note, submitted_at) ON public.cv_references TO anon;

-- ============================================================================
-- End of migration 094
-- ============================================================================
