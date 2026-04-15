-- ============================================================
-- CMS-Managed Scheduling Rules (migration 047)
-- ============================================================
-- Single source of truth for the schedulingEngine's behavior:
-- buffer minutes, day windows, preferred training windows,
-- intensity limits, and the event-priority order used by
-- scheduleRuleEngine. Previously these values were hardcoded in
-- services/schedulingEngine.ts and services/scheduling/scheduleRuleEngine.ts.
-- Moving them into the DB lets the admin panel tune them live
-- without a code deploy.
--
-- Only ONE row may be active at a time (partial unique index below).
-- The backend loads it via lib/schedulingRulesLoader.ts with a 60s
-- in-memory cache; callers that previously imported DEFAULT_CONFIG now
-- call getActiveSchedulingConfig().

CREATE TABLE IF NOT EXISTS public.scheduling_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active row at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduling_rules_single_active
  ON public.scheduling_rules (is_active)
  WHERE is_active = true;

-- RLS: read-open for authenticated users (mobile & web clients),
-- write via service role only (admin panel uses supabaseAdmin).
ALTER TABLE public.scheduling_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_rules_read ON public.scheduling_rules;
CREATE POLICY scheduling_rules_read
  ON public.scheduling_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed with the current hardcoded defaults so deploying this migration
-- does NOT change any live behavior. Admin can tune from here.
INSERT INTO public.scheduling_rules (config, is_active)
VALUES (
  '{
    "buffers": {
      "default": 30,
      "afterHighIntensity": 90,
      "afterMatch": 240,
      "beforeMatch": 120
    },
    "dayWindow": {
      "startHour": 6,
      "endHour": 22
    },
    "preferredTrainingWindow": {
      "startMin": 930,
      "endMin": 1140
    },
    "limits": {
      "maxSessionsPerDay": 3,
      "noHardOnExamDay": true,
      "intensityCapOnExamDays": "LIGHT"
    },
    "priority": {
      "normal":       ["school","exam","match","recovery","club","gym","study","personal"],
      "leagueActive": ["school","match","recovery","exam","club","gym","study","personal"],
      "examPeriod":   ["school","exam","recovery","study","match","club","gym","personal"],
      "leagueExam":   ["school","match","exam","recovery","study","club","gym","personal"]
    }
  }'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION public.touch_scheduling_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduling_rules_touch ON public.scheduling_rules;
CREATE TRIGGER trg_scheduling_rules_touch
  BEFORE UPDATE ON public.scheduling_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_scheduling_rules_updated_at();
