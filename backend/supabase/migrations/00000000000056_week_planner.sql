-- ============================================================
-- Week Planner — Snapshot Table + Compliance Tracking
-- ============================================================
-- Stores a structured week plan once the athlete confirms it.
-- Powers trend analysis: what mix did you pick, what actually
-- happened, how to adapt next week's suggestion.
--
-- calendar_events.completed toggle drives compliance math.
-- ============================================================

-- ── athlete_week_plans ──
create table public.athlete_week_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  week_start      date not null,                      -- Monday of the week
  generated_at    timestamptz not null default now(),

  -- The athlete's exact inputs (for replay + trend diffing).
  --   { trainingMix: TrainingMixItem[], studyMix: StudyMixItem[], theme?: string }
  inputs          jsonb not null,

  -- Final placed items. Each item:
  --   { title, category, subject?, date, startTime, endTime, durationMin,
  --     eventType, intensity, placementReason }
  plan_items      jsonb not null,

  -- Pre-computed summary (avoids re-scanning plan_items for display).
  --   { trainingSessions, studySessions, totalMinutes, hardSessions, predictedLoadAu }
  summary         jsonb not null,

  -- Forward-pointer into calendar_events rows created from this plan.
  -- Populated by the commit endpoint; used by the nightly compliance job.
  calendar_event_ids uuid[] not null default '{}',

  -- Nightly cron (Monday 01:00 for the prior week) fills these:
  --   compliance_rate: completed / total (0.00–1.00)
  --   outcome: { completedSessions, skippedSessions, avgReadiness, loadAchievedAu }
  compliance_rate numeric(3,2),
  outcome         jsonb,

  -- Lifecycle. `active` during the week, `completed` after compliance compute,
  -- `superseded` if the athlete re-ran the planner mid-week.
  status          text not null default 'active'
                    check (status in ('active', 'completed', 'superseded')),

  created_at      timestamptz not null default now(),

  unique (user_id, week_start)
);

create index idx_week_plans_user_week
  on public.athlete_week_plans (user_id, week_start desc);

create index idx_week_plans_status_pending
  on public.athlete_week_plans (user_id, status)
  where status = 'active';

alter table public.athlete_week_plans enable row level security;

create policy "Users own their week plans"
  on public.athlete_week_plans
  for all
  using (auth.uid() = user_id);

-- Service role can read/write for cron + event handlers.
create policy "Service role full access"
  on public.athlete_week_plans
  for all
  to service_role
  using (true)
  with check (true);


-- ── calendar_events: completion toggle ──
-- Adherence tracking needs a yes/no flag. Done this way (toggle on event)
-- rather than a satellite table because it's a per-event, mostly-false
-- boolean — a join would be wasteful at read time.

alter table public.calendar_events
  add column if not exists completed      boolean not null default false;

alter table public.calendar_events
  add column if not exists completed_at   timestamptz;

create index if not exists idx_calendar_completed
  on public.calendar_events (user_id, completed, start_at)
  where completed = true;

comment on column public.calendar_events.completed is
  'Athlete marks the session done. Drives week-plan compliance rate.';
comment on column public.calendar_events.completed_at is
  'Set on the transition false→true. Null otherwise.';
