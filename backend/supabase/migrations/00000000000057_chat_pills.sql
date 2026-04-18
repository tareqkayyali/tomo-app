-- ════════════════════════════════════════════════════════════════════════════
-- Migration 057: chat_pills — CMS-managed Chat Pill library + usage telemetry
-- ════════════════════════════════════════════════════════════════════════════
--
-- Atomic cutover away from the old `proactive_dashboard` config:
--   1. Creates `chat_pill_usage` (user × pill × source × time) with RLS.
--   2. Seeds `ui_config.chat_pills` with the starter library (18 pills) +
--      default Fixed-mode empty-state selection.
--   3. Deletes the `proactive_dashboard` row — the component consuming it is
--      removed in the same PR, so there is no partial state.
--
-- `inResponse.enabled = false` and `shadowMode = false` by default; PR2
-- flips these independently via the admin UI.
--
-- Rollback (DOWN):
--   DROP TABLE IF EXISTS chat_pill_usage;
--   DELETE FROM ui_config WHERE config_key = 'chat_pills';
-- (The old `proactive_dashboard` row is NOT restored — revert the backend
-- commit that seeded it if needed.)
--
-- Keep the seed JSON below in sync with backend/lib/chatPills/defaults.ts.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Prerequisite: ui_config table ────────────────────────────────────────
-- `ui_config` is the generic key/value store for CMS-managed config rows
-- (theme, component_styles, mastery_pillars, chat_pills, ...). In production
-- it was created out-of-band; no migration declared it. Declaring it here
-- (the first migration to write to it) with IF NOT EXISTS makes 057
-- self-contained: no-op on prod, closes the gap on fresh local resets.

CREATE TABLE IF NOT EXISTS public.ui_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   text        NOT NULL UNIQUE,
  config_value jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── chat_pill_usage table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_pill_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pill_id    text        NOT NULL,
  source     text        NOT NULL CHECK (source IN ('empty_state', 'in_response')),
  used_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpu_user_time ON public.chat_pill_usage (user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpu_user_pill ON public.chat_pill_usage (user_id, pill_id);
CREATE INDEX IF NOT EXISTS idx_cpu_pill_time ON public.chat_pill_usage (pill_id, used_at DESC);

ALTER TABLE public.chat_pill_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpu_own_rows ON public.chat_pill_usage;
CREATE POLICY cpu_own_rows ON public.chat_pill_usage
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.chat_pill_usage IS
  'Telemetry for chat pill taps. Feeds dynamic empty-state ranking (top-4 last 60d) and in-response chipResolver analytics. RLS: user_id = auth.uid().';

-- ── Seed chat_pills ui_config row ────────────────────────────────────────

INSERT INTO public.ui_config (config_key, config_value)
VALUES (
  'chat_pills',
  '{
    "version": 1,
    "emptyState": {
      "mode": "fixed",
      "fixedIds": ["plan_study", "plan_training", "plan_my_week", "check_benchmarks"],
      "defaultFallbackIds": ["plan_study", "plan_training", "plan_my_week", "check_benchmarks"]
    },
    "inResponse": {
      "enabled": false,
      "maxPerResponse": 3,
      "shadowMode": false
    },
    "library": [
      { "id": "plan_study",            "label": "Plan Study",           "message": "plan my study schedule",              "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["exam_soon","schedule_gap","response:text"],                     "excludeTags": [],                   "priority": 6 },
      { "id": "plan_training",         "label": "Plan Training",        "message": "plan my training week",               "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["empty_week","schedule_gap","has_programs","response:session_plan"], "excludeTags": ["rest_day","injury"], "priority": 6 },
      { "id": "plan_my_week",          "label": "Plan My Week",         "message": "help me plan my week",                "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["empty_week","schedule_gap","always"],                           "excludeTags": [],                   "priority": 4 },
      { "id": "check_benchmarks",      "label": "Check My Benchmarks",  "message": "show me my benchmarks",               "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["has_benchmarks","response:benchmark","always"],                 "excludeTags": [],                   "priority": 5 },
      { "id": "log_test",              "label": "Log a test",           "message": "I want to log a new test",            "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["metric_missing","response:benchmark"],                          "excludeTags": [],                   "priority": 7 },
      { "id": "check_in",              "label": "Check in",             "message": "check in",                            "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["needs_checkin","stale_checkin"],                                "excludeTags": [],                   "priority": 9 },
      { "id": "add_event",             "label": "Add event",            "message": "I want to add a training session",    "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["empty_week","rest_day"],                                        "excludeTags": [],                   "priority": 5 },
      { "id": "strengths_gaps",        "label": "My strengths",         "message": "what are my strengths and gaps?",     "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["has_benchmarks","benchmark_weak","benchmark_strong"],           "excludeTags": [],                   "priority": 6 },
      { "id": "leaderboard",           "label": "Leaderboard",          "message": "show me the leaderboard",             "enabled": true,  "allowInEmptyState": true,  "allowInResponse": false, "tags": ["has_benchmarks","always"],                                      "excludeTags": [],                   "priority": 3 },
      { "id": "my_rules",              "label": "My rules",             "message": "edit my schedule rules",              "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["has_clash","schedule_gap"],                                     "excludeTags": [],                   "priority": 5 },
      { "id": "check_conflicts",       "label": "Check conflicts",      "message": "check for any schedule conflicts",    "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["has_clash","response:clash_fix"],                               "excludeTags": [],                   "priority": 8 },
      { "id": "my_programs",           "label": "My programs",          "message": "my programs",                         "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["has_programs","no_programs","response:programs"],               "excludeTags": [],                   "priority": 5 },
      { "id": "growth_stage",          "label": "Growth stage",         "message": "calculate my growth stage",           "enabled": true,  "allowInEmptyState": true,  "allowInResponse": false, "tags": ["growth","cv_incomplete"],                                       "excludeTags": [],                   "priority": 4 },
      { "id": "notification_settings", "label": "Notifications",        "message": "notification settings",               "enabled": true,  "allowInEmptyState": false, "allowInResponse": false, "tags": ["always"],                                                       "excludeTags": [],                   "priority": 2 },
      { "id": "my_readiness",          "label": "My readiness",         "message": "what''s my readiness?",                "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["response:readiness","needs_checkin","always"],                  "excludeTags": [],                   "priority": 6 },
      { "id": "my_streak",             "label": "My streak",            "message": "my streak",                           "enabled": true,  "allowInEmptyState": false, "allowInResponse": true,  "tags": ["streak_milestone","streak_risk"],                               "excludeTags": [],                   "priority": 5 },
      { "id": "edit_cv",               "label": "Edit CV",              "message": "edit my CV profile",                  "enabled": true,  "allowInEmptyState": false, "allowInResponse": true,  "tags": ["cv_incomplete"],                                                "excludeTags": [],                   "priority": 4 },
      { "id": "my_timeline",           "label": "My timeline",          "message": "help me manage my timeline",          "enabled": true,  "allowInEmptyState": true,  "allowInResponse": true,  "tags": ["empty_week","schedule_gap"],                                    "excludeTags": [],                   "priority": 4 }
    ]
  }'::jsonb
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at   = now();

-- ── Atomic cutover: delete old Proactive Dashboard config ─────────────

DELETE FROM public.ui_config WHERE config_key = 'proactive_dashboard';
