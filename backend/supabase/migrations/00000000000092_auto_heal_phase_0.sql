-- =========================================================================
-- Migration 092: Auto-Healing Loop — Foundations (Phase 0)
-- =========================================================================
-- Adds the schema + config scaffolding for the enterprise auto-heal loop
-- that will ship across Phases 1–5. This migration is PURELY ADDITIVE:
--   1. EXTENDS existing ai_issues / ai_fixes (from migrations 039/040) with
--      eval-source fields, dual severity vocabulary, revert history, etc.
--      Legacy trace-sourced behaviour preserved via source discriminator.
--   2. ADDS 6 new tables: ai_eval_runs, ai_eval_results, ai_eval_baselines,
--      ai_auto_heal_config, ai_auto_heal_audit, ai_post_merge_watch
--   3. ADDS users.is_eval_fixture marker + users_real view +
--      RESTRICTIVE policy so fixtures never leak to anon/authenticated reads.
--
-- Kill-switch: ai_auto_heal_config.enabled defaults to FALSE — the loop is
-- inert until Phase 5 flips it. Safety paths are permanently blocked via
-- blocked_paths list (enforced at applier code + config).
--
-- RLS pattern mirrors migration 082 (system_config):
--   - service_role: full access
--   - organization_memberships.role IN (super_admin, institutional_pd, analyst): read
--   - super_admin only: config writes (kill-switch, baseline promotion)
--
-- Idempotent. Safe to re-run.
-- =========================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- Part 1: EXTEND existing ai_issues (migration 039 was too narrow)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE ai_issues
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('eval','langsmith_trace','manual')),
  ADD COLUMN IF NOT EXISTS source_ref UUID,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS severity_class TEXT
    CHECK (severity_class IN ('p1_safety','p2_quality','p3_cost','p4_ux')),
  ADD COLUMN IF NOT EXISTS target_file TEXT,
  ADD COLUMN IF NOT EXISTS target_symbol TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revert_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_by_fix_id UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS occurrence_count INT NOT NULL DEFAULT 1;

-- Backfill source + severity_class for existing rows (langsmith_trace origin)
UPDATE ai_issues
  SET source = COALESCE(source, 'langsmith_trace'),
      severity_class = CASE severity
        WHEN 'critical' THEN 'p1_safety'
        WHEN 'high'     THEN 'p2_quality'
        WHEN 'medium'   THEN 'p3_cost'
        WHEN 'low'      THEN 'p4_ux' END,
      category = COALESCE(category, issue_type),
      description = COALESCE(description, pattern_summary),
      first_seen_at = COALESCE(first_seen_at, created_at)
  WHERE source IS NULL OR severity_class IS NULL;

ALTER TABLE ai_issues ALTER COLUMN source SET NOT NULL;
ALTER TABLE ai_issues ALTER COLUMN source SET DEFAULT 'langsmith_trace';

-- Expand status CHECK to superset (keeps legacy values valid)
ALTER TABLE ai_issues DROP CONSTRAINT IF EXISTS ai_issues_status_check;
ALTER TABLE ai_issues ADD CONSTRAINT ai_issues_status_check
  CHECK (status IN (
    'open','fix_generated','fix_applied','resolved','dismissed',
    'needs_human','rejected_with_justification'
  ));

-- Replace global unique with partial index (trace-source only)
ALTER TABLE ai_issues DROP CONSTRAINT IF EXISTS uq_issue_week_type;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_issues_trace_week_type
  ON ai_issues (week_start, issue_type)
  WHERE source = 'langsmith_trace' AND week_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_issues_eval_dedup
  ON ai_issues (category, target_symbol, source_ref, status)
  WHERE source = 'eval' AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_ai_issues_severity_class
  ON ai_issues (severity_class, status, created_at DESC);

DROP POLICY IF EXISTS ai_issues_admin_read ON ai_issues;
CREATE POLICY ai_issues_admin_read ON ai_issues FOR SELECT
  USING (EXISTS (SELECT 1 FROM organization_memberships
                 WHERE user_id = auth.uid() AND is_active = TRUE
                   AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_issues TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Part 2: EXTEND existing ai_fixes (migration 040)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE ai_fixes
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS diff TEXT,
  ADD COLUMN IF NOT EXISTS diff_hash TEXT,
  ADD COLUMN IF NOT EXISTS target_files TEXT[],
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS pr_url TEXT,
  ADD COLUMN IF NOT EXISTS re_eval_run_id UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE ai_fixes
  SET author = COALESCE(author, 'haiku-auto'),
      target_files = COALESCE(target_files,
        CASE WHEN file_path IS NOT NULL THEN ARRAY[file_path] ELSE ARRAY[]::TEXT[] END)
  WHERE author IS NULL;

ALTER TABLE ai_fixes DROP CONSTRAINT IF EXISTS ai_fixes_status_check;
ALTER TABLE ai_fixes ADD CONSTRAINT ai_fixes_status_check
  CHECK (status IN (
    'pending','approved','applied','verified','rejected',
    'proposed','applying','re_eval_running','re_eval_pass',
    'auto_approved_pr_open','merged','re_eval_fail','reverted',
    'awaiting_human_approval','applied_wrong_location'
  ));

CREATE INDEX IF NOT EXISTS idx_ai_fixes_author_status
  ON ai_fixes (author, status, created_at DESC);

DROP POLICY IF EXISTS ai_fixes_admin_read ON ai_fixes;
CREATE POLICY ai_fixes_admin_read ON ai_fixes FOR SELECT
  USING (EXISTS (SELECT 1 FROM organization_memberships
                 WHERE user_id = auth.uid() AND is_active = TRUE
                   AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_fixes TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Part 3: Users fixture marker + prod-safe view + RESTRICTIVE policy
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_eval_fixture BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_eval_fixture
  ON public.users(is_eval_fixture) WHERE is_eval_fixture = TRUE;

CREATE OR REPLACE VIEW users_real AS
  SELECT * FROM public.users WHERE is_eval_fixture = FALSE;

COMMENT ON VIEW users_real IS
  'Production users only. Fixtures excluded. Product/analytics code should read this view for non-auth flows.';

DROP POLICY IF EXISTS users_restrict_fixtures ON public.users;
CREATE POLICY users_restrict_fixtures ON public.users
  AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (is_eval_fixture = FALSE)
  WITH CHECK (is_eval_fixture = FALSE);

-- ════════════════════════════════════════════════════════════════════
-- Part 4: CREATE 6 NEW TABLES
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL CHECK (trigger IN (
    'pr','nightly','pre_deploy','manual','auto_heal_reeval'
  )),
  suite_set TEXT[] NOT NULL,
  commit_sha TEXT,
  branch TEXT,
  pipeline_version TEXT,
  total INT DEFAULT 0,
  passed INT DEFAULT 0,
  failed INT DEFAULT 0,
  errored INT DEFAULT 0,
  cost_usd_total NUMERIC(10,4) DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  report_url TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN (
    'running','passed','failed','errored','aborted'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  create_issues BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_trigger_status
  ON ai_eval_runs(trigger, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_commit
  ON ai_eval_runs(commit_sha) WHERE commit_sha IS NOT NULL;
ALTER TABLE ai_eval_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_eval_runs_service_all ON ai_eval_runs;
CREATE POLICY ai_eval_runs_service_all ON ai_eval_runs
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS ai_eval_runs_admin_read ON ai_eval_runs;
CREATE POLICY ai_eval_runs_admin_read ON ai_eval_runs
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_eval_runs TO authenticated;
GRANT ALL    ON ai_eval_runs TO service_role;

CREATE TABLE IF NOT EXISTS ai_eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_eval_runs(id) ON DELETE CASCADE,
  suite TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail','error','skip')),
  expected JSONB,
  actual JSONB,
  latency_ms INT,
  cost_usd NUMERIC(10,6),
  model_used TEXT,
  probable_target_file TEXT,
  probable_target_symbol TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_eval_results_run_status
  ON ai_eval_results(run_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_eval_results_scenario_time
  ON ai_eval_results(scenario_id, created_at DESC);
ALTER TABLE ai_eval_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_eval_results_service_all ON ai_eval_results;
CREATE POLICY ai_eval_results_service_all ON ai_eval_results
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS ai_eval_results_admin_read ON ai_eval_results;
CREATE POLICY ai_eval_results_admin_read ON ai_eval_results
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_eval_results TO authenticated;
GRANT ALL    ON ai_eval_results TO service_role;

CREATE TABLE IF NOT EXISTS ai_eval_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('active','long_term_anchor')),
  commit_sha TEXT NOT NULL,
  promoted_at TIMESTAMPTZ DEFAULT NOW(),
  promoted_by TEXT NOT NULL,
  consecutive_green_nights INT,
  behavior_fingerprint TEXT,
  drift_vs_anchor_pct NUMERIC(5,2),
  notes TEXT,
  is_retired BOOLEAN DEFAULT FALSE,
  retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_eval_baselines_active_kind
  ON ai_eval_baselines(kind) WHERE is_retired = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_eval_baselines_kind_time
  ON ai_eval_baselines(kind, promoted_at DESC);
ALTER TABLE ai_eval_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_eval_baselines_service_all ON ai_eval_baselines;
CREATE POLICY ai_eval_baselines_service_all ON ai_eval_baselines
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS ai_eval_baselines_admin_read ON ai_eval_baselines;
CREATE POLICY ai_eval_baselines_admin_read ON ai_eval_baselines
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_eval_baselines TO authenticated;
GRANT ALL    ON ai_eval_baselines TO service_role;

COMMENT ON TABLE ai_eval_baselines IS
  'Dual anchor. "active" auto-advances via pg_cron after 3 consecutive green nightlies (Phase 1). "long_term_anchor" advances ONLY by super_admin manual promotion.';

CREATE TABLE IF NOT EXISTS ai_auto_heal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_fixes_per_day INT NOT NULL DEFAULT 5,
  max_fixes_per_file_per_week INT NOT NULL DEFAULT 2,
  cooldown_minutes_after_revert INT NOT NULL DEFAULT 60,
  consecutive_clean_merges_required INT NOT NULL DEFAULT 1,
  post_merge_clean_hours INT NOT NULL DEFAULT 48,
  rolling_90d_revert_rate_cap NUMERIC(4,2) NOT NULL DEFAULT 0.25,
  budget_daily_usd NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  budget_alert_threshold_pct NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  allowed_categories TEXT[] NOT NULL DEFAULT ARRAY[
    'verbose_response','zero_tool_response','cost_spike'
  ],
  blocked_paths TEXT[] NOT NULL DEFAULT ARRAY[
    'ai-service/app/safety/%','ai-service/app/validators/%','ai-service/app/guards/%',
    '%enforcePHVSafety%','%calculatePHVStage%','%calculateCCRS%',
    '%readinessCalculator%','%injury_risk%','%danger_zone%',
    'ai-service/app/rules/phv%','ai-service/app/rules/ccrs%','ai-service/app/rules/readiness%',
    'ai-service/evals/%','ai-service/tests/%','backend/tests/%','tests/%',
    '%/test_%.py','%_test.py','%.test.ts','%.test.tsx','%.spec.ts',
    '.env%','%secrets/%','%credentials/%','backend/supabase/migrations/%'
  ],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
ALTER TABLE ai_auto_heal_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_auto_heal_config_service_read ON ai_auto_heal_config;
CREATE POLICY ai_auto_heal_config_service_read ON ai_auto_heal_config
  FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS ai_auto_heal_config_super_admin_write ON ai_auto_heal_config;
CREATE POLICY ai_auto_heal_config_super_admin_write ON ai_auto_heal_config
  FOR ALL USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE AND role = 'super_admin'));
DROP POLICY IF EXISTS ai_auto_heal_config_admin_read ON ai_auto_heal_config;
CREATE POLICY ai_auto_heal_config_admin_read ON ai_auto_heal_config
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_auto_heal_config TO authenticated;
GRANT ALL    ON ai_auto_heal_config TO service_role;

CREATE TABLE IF NOT EXISTS ai_auto_heal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_auto_heal_audit_actor_time
  ON ai_auto_heal_audit(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_auto_heal_audit_target
  ON ai_auto_heal_audit(target_table, target_id);
ALTER TABLE ai_auto_heal_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_auto_heal_audit_insert ON ai_auto_heal_audit;
CREATE POLICY ai_auto_heal_audit_insert ON ai_auto_heal_audit
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM organization_memberships
      WHERE user_id = auth.uid() AND is_active = TRUE
      AND role IN ('super_admin','institutional_pd')));
DROP POLICY IF EXISTS ai_auto_heal_audit_admin_read ON ai_auto_heal_audit;
CREATE POLICY ai_auto_heal_audit_admin_read ON ai_auto_heal_audit
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT, INSERT ON ai_auto_heal_audit TO authenticated;
GRANT ALL             ON ai_auto_heal_audit TO service_role;

CREATE TABLE IF NOT EXISTS ai_post_merge_watch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_id UUID NOT NULL REFERENCES ai_fixes(id) ON DELETE CASCADE,
  merged_commit_sha TEXT NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL,
  watch_until TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
  regressions_detected INT NOT NULL DEFAULT 0,
  regression_details JSONB DEFAULT '[]'::jsonb,
  auto_revert_pr_url TEXT,
  status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN (
    'watching','clean','reverted','monitor_down'
  ))
);
CREATE INDEX IF NOT EXISTS idx_ai_post_merge_watch_active
  ON ai_post_merge_watch(status, watch_until) WHERE status = 'watching';
ALTER TABLE ai_post_merge_watch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_post_merge_watch_service_all ON ai_post_merge_watch;
CREATE POLICY ai_post_merge_watch_service_all ON ai_post_merge_watch
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS ai_post_merge_watch_admin_read ON ai_post_merge_watch;
CREATE POLICY ai_post_merge_watch_admin_read ON ai_post_merge_watch
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid() AND is_active = TRUE
    AND role IN ('super_admin','institutional_pd','analyst')));
GRANT SELECT ON ai_post_merge_watch TO authenticated;
GRANT ALL    ON ai_post_merge_watch TO service_role;

-- FK back from ai_issues.resolved_by_fix_id (now that ai_fixes has the new schema)
DO $$ BEGIN
  ALTER TABLE ai_issues
    ADD CONSTRAINT fk_ai_issues_resolved_by_fix
    FOREIGN KEY (resolved_by_fix_id) REFERENCES ai_fixes(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════
-- Part 5: Seed config + placeholder baselines
-- ════════════════════════════════════════════════════════════════════

INSERT INTO ai_auto_heal_config (id, enabled, updated_by)
  VALUES ('00000000-0000-0000-0000-000000000001', FALSE, 'migration:phase_0')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_eval_baselines (kind, commit_sha, promoted_by, notes)
  VALUES
    ('active', 'PENDING_FIRST_NIGHTLY', 'migration:phase_0',
     'Placeholder. Replaced by pg_cron after first green nightly in Phase 1.'),
    ('long_term_anchor', 'PENDING_MANUAL_PROMOTION', 'migration:phase_0',
     'Placeholder. Super_admin must manually promote after Phase 3.')
  ON CONFLICT DO NOTHING;

COMMIT;
