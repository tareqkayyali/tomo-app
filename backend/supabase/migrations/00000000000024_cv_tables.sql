-- ============================================================================
-- Migration 024: Player CV Tables
-- Professional CV system — auto-populated from Tomo data fabric,
-- manual entry for external data (clubs, academics, video, references).
-- ============================================================================

-- ── Users table additions ─────────────────────────────────────────────────
-- These columns support CV identity & profile sections.
-- Using IF NOT EXISTS for columns that may already exist in production.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS passport_country TEXT,
  ADD COLUMN IF NOT EXISTS secondary_positions TEXT[],
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS parent_guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_guardian_email TEXT,
  ADD COLUMN IF NOT EXISTS parent_guardian_phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_foot TEXT CHECK (preferred_foot IN ('left', 'right', 'both')),
  ADD COLUMN IF NOT EXISTS playing_style TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));

-- ── Athlete snapshot additions ────────────────────────────────────────────
-- New computed fields for CV assembly & coachability index.

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS coachability_target_rate    DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS coachability_adaptation     DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS coachability_responsiveness DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS training_age_months         SMALLINT,
  ADD COLUMN IF NOT EXISTS cv_completeness_club_pct    SMALLINT,
  ADD COLUMN IF NOT EXISTS cv_completeness_uni_pct     SMALLINT,
  ADD COLUMN IF NOT EXISTS exam_period_training_rate   DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS career_entry_count          SMALLINT DEFAULT 0;

-- ── CV Profiles ───────────────────────────────────────────────────────────
-- Central CV state: AI statements, visibility, completeness, share tokens.
-- One row per athlete.

CREATE TABLE public.cv_profiles (
  athlete_id                UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,

  -- AI-drafted personal statements
  personal_statement_club   TEXT,
  personal_statement_uni    TEXT,
  statement_status          TEXT DEFAULT 'draft'
    CHECK (statement_status IN ('draft', 'approved', 'needs_update')),
  statement_last_generated  TIMESTAMPTZ,
  statement_data_snapshot   JSONB,

  -- AI-drafted trajectory narrative
  trajectory_narrative      TEXT,
  trajectory_last_generated TIMESTAMPTZ,

  -- AI-drafted dual-role narrative (university CV only)
  dual_role_narrative       TEXT,
  dual_role_last_generated  TIMESTAMPTZ,

  -- Manual profile fields not on users table
  formation_preference      TEXT,
  dominant_zone             TEXT,

  -- Visibility & discoverability
  cv_club_discoverable      BOOLEAN DEFAULT FALSE,
  cv_uni_discoverable       BOOLEAN DEFAULT FALSE,
  show_performance_data     BOOLEAN DEFAULT TRUE,
  show_coachability         BOOLEAN DEFAULT TRUE,
  show_load_data            BOOLEAN DEFAULT FALSE,

  -- Completeness tracking (mirrors snapshot but stored here for share pages)
  completeness_club_pct     SMALLINT DEFAULT 0,
  completeness_uni_pct      SMALLINT DEFAULT 0,

  -- Export metadata
  last_club_export_at       TIMESTAMPTZ,
  last_uni_export_at        TIMESTAMPTZ,

  -- Shareable tokenised links
  share_token_club          TEXT UNIQUE,
  share_token_uni           TEXT UNIQUE,
  share_club_views          INT DEFAULT 0,
  share_uni_views           INT DEFAULT 0,

  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cv_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their cv_profiles"
  ON public.cv_profiles FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_profiles TO service_role;

-- ── CV Career Entries ─────────────────────────────────────────────────────
-- Club, academy, national team, trial, camp, showcase history.

CREATE TABLE public.cv_career_entries (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entry_type      TEXT NOT NULL
    CHECK (entry_type IN ('club', 'academy', 'national_team', 'trial', 'camp', 'showcase')),
  club_name       TEXT NOT NULL,
  league_level    TEXT,
  country         TEXT,
  position        TEXT,
  started_month   TEXT,             -- 'YYYY-MM' format
  ended_month     TEXT,             -- null if current
  is_current      BOOLEAN DEFAULT FALSE,
  appearances     INT,
  goals           INT,
  assists         INT,
  clean_sheets    INT,
  achievements    TEXT[],
  injury_note     TEXT,
  display_order   SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cv_career_athlete ON public.cv_career_entries (athlete_id, display_order);

ALTER TABLE public.cv_career_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their career entries"
  ON public.cv_career_entries FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_career_entries TO service_role;

-- ── CV Academic Entries ───────────────────────────────────────────────────
-- School, college, university records for NCAA / university CV.

CREATE TABLE public.cv_academic_entries (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institution           TEXT NOT NULL,
  country               TEXT,
  qualification         TEXT
    CHECK (qualification IN ('High School', 'GCSE', 'A-Level', 'IB', 'Tawjihi', 'Bachelor', 'Other')),
  year_start            INT,
  year_end              INT,
  gpa                   TEXT,           -- text to handle 4.0, 100%, IB 45 etc.
  gpa_scale             TEXT DEFAULT '4.0',
  predicted_grade       TEXT,
  honours               TEXT[],
  ncaa_eligibility_id   TEXT,
  is_current            BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cv_academic_athlete ON public.cv_academic_entries (athlete_id);

ALTER TABLE public.cv_academic_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their academic entries"
  ON public.cv_academic_entries FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_academic_entries TO service_role;

-- ── CV Media Links ────────────────────────────────────────────────────────
-- Video highlights, social profiles, Wyscout/Hudl links.

CREATE TABLE public.cv_media_links (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_type      TEXT NOT NULL
    CHECK (media_type IN ('highlight_reel', 'full_match', 'training', 'social')),
  platform        TEXT
    CHECK (platform IN ('youtube', 'vimeo', 'instagram', 'tiktok', 'wyscout', 'hudl', 'other')),
  url             TEXT NOT NULL,
  title           TEXT,
  is_primary      BOOLEAN DEFAULT FALSE,
  display_order   SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cv_media_athlete ON public.cv_media_links (athlete_id, display_order);

ALTER TABLE public.cv_media_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their media links"
  ON public.cv_media_links FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_media_links TO service_role;

-- ── CV References ─────────────────────────────────────────────────────────
-- Coach and mentor references with consent tracking.

CREATE TABLE public.cv_references (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referee_name      TEXT NOT NULL,
  referee_role      TEXT NOT NULL,
  club_institution  TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  relationship      TEXT
    CHECK (relationship IN ('current_coach', 'former_coach', 'academy_director', 'teacher', 'other')),
  consent_given     BOOLEAN DEFAULT FALSE,
  display_order     SMALLINT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cv_references_athlete ON public.cv_references (athlete_id);

ALTER TABLE public.cv_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their references"
  ON public.cv_references FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_references TO service_role;

-- ── CV Character Traits ───────────────────────────────────────────────────
-- Awards, leadership, languages, community contributions.

CREATE TABLE public.cv_character_traits (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trait_category  TEXT NOT NULL
    CHECK (trait_category IN ('leadership', 'community', 'language', 'award', 'camp')),
  title           TEXT NOT NULL,
  description     TEXT,
  level           TEXT
    CHECK (level IN ('club', 'regional', 'national', 'international')),
  date            DATE,
  display_order   SMALLINT
);

CREATE INDEX idx_cv_traits_athlete ON public.cv_character_traits (athlete_id);

ALTER TABLE public.cv_character_traits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes own their character traits"
  ON public.cv_character_traits FOR ALL
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_character_traits TO service_role;

-- ── CV Share View Tracking ────────────────────────────────────────────────
-- Tracks when scouts/recruiters view a shared CV link.

CREATE TABLE public.cv_share_views (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cv_type         TEXT NOT NULL CHECK (cv_type IN ('club', 'university')),
  share_token     TEXT NOT NULL,
  viewer_ip       TEXT,
  viewer_ua       TEXT,
  viewed_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cv_share_views_athlete ON public.cv_share_views (athlete_id, viewed_at DESC);

ALTER TABLE public.cv_share_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes can read their share views"
  ON public.cv_share_views FOR SELECT
  USING (athlete_id = auth.uid());

GRANT ALL ON public.cv_share_views TO service_role;
