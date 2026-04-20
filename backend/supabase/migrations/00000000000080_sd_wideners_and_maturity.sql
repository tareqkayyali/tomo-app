-- ============================================================================
-- Migration 080: SD Wideners + Maturity-Adjusted Benchmark Snapshots
--
-- Background: Youth performance variance is genuinely wider than senior
-- variance (Malina 2015, Buchheit 2012, Mendez-Villanueva 2024). The
-- SEN-derived SDs in sport_normative_data are too tight for U13/U15/U17/U19,
-- inflating percentiles for elite-leaning youth athletes. Similarly, an
-- early-maturer (POST-PHV) compared against chronological-age peers will
-- be over-rated, while a late-maturer (PRE-PHV) will be under-rated.
--
-- This migration adds two orthogonal CMS-editable fairness controls:
--   1. sport_sd_wideners — per (sport, age_band) SD multiplier, applied at
--      percentile-calculation time. CMS-editable, audit-logged per snapshot.
--   2. player_benchmark_snapshots audit columns — capture chrono age band,
--      maturity-adjusted age band, PHV stage at test, and the widener
--      multiplier that was applied. Enables rollback + post-hoc analysis
--      when methodology changes.
--
-- All migrations below follow the idempotent pattern (CREATE … IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE POLICY) so re-running is safe.
-- ============================================================================

-- ── 1. sport_sd_wideners ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sport_sd_wideners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id    text NOT NULL,
  age_band    text NOT NULL CHECK (age_band IN ('U13','U15','U17','U19','SEN','SEN30','VET')),
  multiplier  numeric(4,3) NOT NULL CHECK (multiplier BETWEEN 0.5 AND 3.0),
  rationale   text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (sport_id, age_band)
);

CREATE INDEX IF NOT EXISTS idx_sport_sd_wideners_lookup
  ON public.sport_sd_wideners (sport_id, age_band);

ALTER TABLE public.sport_sd_wideners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sport_sd_wideners read" ON public.sport_sd_wideners;
CREATE POLICY "sport_sd_wideners read"
  ON public.sport_sd_wideners FOR SELECT
  USING (true);  -- Wideners are non-sensitive reference data; anyone
                 -- authenticated can read so the benchmark service works.

-- Write policy: mirrors the enterprise RBAC pattern established by migration
-- 075 (drop_is_admin). Only super_admin / institutional_pd on an active
-- organization_membership can mutate wideners.
DROP POLICY IF EXISTS "sport_sd_wideners write admin" ON public.sport_sd_wideners;
CREATE POLICY "sport_sd_wideners write admin"
  ON public.sport_sd_wideners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
        AND om.role IN ('super_admin','institutional_pd')
    )
  );

-- ── 2. Seed default wideners (football, signed off 2026-04-20) ─────────────

INSERT INTO public.sport_sd_wideners (sport_id, age_band, multiplier, rationale) VALUES
  ('football', 'U13',    1.600, 'Malina 2015 + Mendez-Villanueva 2011: youth performance variance ~60% wider than senior due to maturation spread'),
  ('football', 'U15',    1.400, 'Buchheit 2012: U15 spread ~40% wider than senior'),
  ('football', 'U17',    1.250, 'Mendez-Villanueva 2024: U17 spread ~25% wider than senior'),
  ('football', 'U19',    1.100, 'Near-adult variance'),
  ('football', 'SEN',    1.000, 'Baseline (norms derived from senior elite)'),
  ('football', 'SEN30',  1.000, 'Baseline'),
  ('football', 'VET',    1.000, 'Baseline')
ON CONFLICT (sport_id, age_band) DO NOTHING;

-- Defaults for other sports — start at 1.0, operators widen via CMS as
-- sport-specific youth norms become available.
INSERT INTO public.sport_sd_wideners (sport_id, age_band, multiplier, rationale)
SELECT sport, ab, 1.000, 'Default — awaiting sport-specific youth calibration'
FROM (VALUES ('soccer'), ('basketball'), ('tennis'), ('padel')) s(sport)
CROSS JOIN (VALUES ('U13'),('U15'),('U17'),('U19'),('SEN'),('SEN30'),('VET')) a(ab)
ON CONFLICT (sport_id, age_band) DO NOTHING;

-- ── 3. player_benchmark_snapshots audit columns ────────────────────────────
-- age_band_used stays for back-compat, populated with the band that was
-- actually used for the norm lookup (maturity-adjusted). chrono_age_band_used
-- is the chronological-age band for audit/rollback. maturity_adjusted_age_band_used
-- mirrors age_band_used when a shift was applied, null otherwise.

ALTER TABLE public.player_benchmark_snapshots
  ADD COLUMN IF NOT EXISTS chrono_age_band_used          text,
  ADD COLUMN IF NOT EXISTS maturity_adjusted_age_band_used text,
  ADD COLUMN IF NOT EXISTS phv_stage_at_test             text,
  ADD COLUMN IF NOT EXISTS sd_widener_applied            numeric(4,3);

-- Backfill chrono_age_band_used from existing age_band_used (which, before
-- this migration, WAS the chronological band — PHV adjustment didn't exist).
UPDATE public.player_benchmark_snapshots
  SET chrono_age_band_used = age_band_used
  WHERE chrono_age_band_used IS NULL AND age_band_used IS NOT NULL;

-- ── 4. updated_at trigger for sport_sd_wideners ────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sd_wideners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sd_wideners_updated_at ON public.sport_sd_wideners;
CREATE TRIGGER trg_sd_wideners_updated_at
  BEFORE UPDATE ON public.sport_sd_wideners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sd_wideners_updated_at();
