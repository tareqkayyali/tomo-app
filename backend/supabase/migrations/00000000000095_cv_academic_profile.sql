-- Migration 095: CV Academic Profile
-- Adds structured academic data for the Player CV scout report.
-- Subject entries: { name, level, grade, grade_max, trend }
-- trend: "up" | "stable" | "down"

CREATE TABLE IF NOT EXISTS public.cv_academic_profile (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_name         text,
  diploma_program     text,         -- e.g. "International Baccalaureate (IB) Diploma"
  grade_year          text,         -- e.g. "Year 12"
  program_label       text,         -- e.g. "DP1"
  gpa_current         numeric(4,2),
  gpa_max             numeric(4,2) NOT NULL DEFAULT 7.0,
  class_rank_pct      integer       CHECK (class_rank_pct BETWEEN 1 AND 100),
  attendance_pct      integer       CHECK (attendance_pct BETWEEN 0 AND 100),
  exam_session_label  text,         -- e.g. "MAY 2026"
  dual_load_note      text,         -- shown as subtitle on scout report
  subjects            jsonb         NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (athlete_id)
);

ALTER TABLE public.cv_academic_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete_own_academic" ON public.cv_academic_profile;
CREATE POLICY "athlete_own_academic" ON public.cv_academic_profile
  FOR ALL USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "admin_academic" ON public.cv_academic_profile;
CREATE POLICY "admin_academic" ON public.cv_academic_profile
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS trg_cv_academic_profile_updated_at ON public.cv_academic_profile;
CREATE TRIGGER trg_cv_academic_profile_updated_at
  BEFORE UPDATE ON public.cv_academic_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
