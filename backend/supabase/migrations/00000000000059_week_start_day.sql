-- ============================================================
-- player_schedule_preferences.week_start_day
-- ============================================================
-- The first day of the athlete's training week. 0=Sunday..6=Saturday.
-- Default 6 (Saturday) matches the common ME academic calendar where
-- the weekend is Fri+Sat and the school/work week starts Sat-Thu.
--
-- Before this column, the week planner hardcoded Monday-first, which
-- confused ME athletes: "this week" on a Saturday resolved to last
-- Monday, so the repair engine's past-day filter left only Sat+Sun
-- visible — looked like the planner could only see today+tomorrow.
--
-- The week planner reads this column and uses it for:
--   - "This week" / "Next week" / "Week after" resolution in the
--     week_scope capsule
--   - Validation in /api/v1/week-plan/draft (weekStart must align
--     with this weekday)
-- ============================================================

alter table public.player_schedule_preferences
  add column if not exists week_start_day smallint not null default 6
    check (week_start_day between 0 and 6);

comment on column public.player_schedule_preferences.week_start_day is
  'First weekday of the training week. 0=Sunday..6=Saturday. Default 6 (Saturday) — ME academic calendar. Editable via My Rules / schedule/rules PATCH.';
