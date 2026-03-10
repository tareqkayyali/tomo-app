-- Tomo Full Schema
-- 16 existing feature tables + 7 forward roadmap tables
-- RLS: user-owns-their-data model on all tables

-- ============================================================
-- USERS
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  sport text not null default 'soccer'
    check (sport in ('soccer', 'basketball', 'tennis', 'padel')),
  age int,
  archetype text check (archetype in ('phoenix', 'titan', 'blade', 'surge')),
  total_points int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  freeze_tokens int not null default 0,
  last_compliant_date date,
  days_since_rest int not null default 0,
  school_hours numeric,
  exam_periods jsonb,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

-- ============================================================
-- CHECKINS
-- ============================================================
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  energy int not null,
  soreness int not null,
  pain_flag boolean not null default false,
  pain_location text,
  sleep_hours numeric not null,
  effort_yesterday int not null default 5,
  mood int not null default 5,
  academic_stress int,
  readiness text not null check (readiness in ('Green', 'Yellow', 'Red')),
  intensity text not null check (intensity in ('rest', 'light', 'moderate', 'hard')),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index idx_checkins_user_date on public.checkins (user_id, date desc);

alter table public.checkins enable row level security;
create policy "Users own their checkins" on public.checkins
  for all using (auth.uid() = user_id);

-- ============================================================
-- PLANS
-- ============================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  date date not null,
  readiness text not null,
  intensity text not null,
  sport text not null,
  workout_type text not null,
  duration int not null default 0,
  warmup jsonb not null default '[]',
  main_workout jsonb not null default '[]',
  cooldown jsonb not null default '[]',
  focus_areas jsonb not null default '[]',
  alerts jsonb not null default '[]',
  modifications jsonb not null default '[]',
  recovery_tips jsonb not null default '[]',
  decision_explanation jsonb,
  archetype_message jsonb,
  disclaimer text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  actual_effort int,
  feedback_notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index idx_plans_user_date on public.plans (user_id, date desc);

alter table public.plans enable row level security;
create policy "Users own their plans" on public.plans
  for all using (auth.uid() = user_id);

-- ============================================================
-- POINTS LEDGER
-- ============================================================
create table public.points_ledger (
  id text primary key, -- deterministic: uid_YYYY-MM-DD
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  points int not null,
  reasons jsonb not null default '[]',
  readiness text,
  intensity text,
  compliant boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_points_user_date on public.points_ledger (user_id, date desc);

alter table public.points_ledger enable row level security;
create policy "Users own their points" on public.points_ledger
  for all using (auth.uid() = user_id);

-- ============================================================
-- MILESTONES
-- ============================================================
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  achieved_at timestamptz not null default now()
);

create index idx_milestones_user on public.milestones (user_id, achieved_at desc);

alter table public.milestones enable row level security;
create policy "Users own their milestones" on public.milestones
  for all using (auth.uid() = user_id);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id text,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_user_session on public.chat_messages (user_id, session_id, created_at);

alter table public.chat_messages enable row level security;
create policy "Users own their chat" on public.chat_messages
  for all using (auth.uid() = user_id);

-- ============================================================
-- CHAT SESSION SUMMARIES
-- ============================================================
create table public.chat_session_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id text not null,
  summary text not null,
  message_count int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_chat_summaries_user on public.chat_session_summaries (user_id, created_at desc);

alter table public.chat_session_summaries enable row level security;
create policy "Users own their summaries" on public.chat_session_summaries
  for all using (auth.uid() = user_id);

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  event_type text not null
    check (event_type in ('training', 'match', 'recovery', 'study', 'exam', 'other')),
  start_at timestamptz not null,
  end_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_calendar_user on public.calendar_events (user_id, start_at);

alter table public.calendar_events enable row level security;
create policy "Users own their events" on public.calendar_events
  for all using (auth.uid() = user_id);

-- ============================================================
-- SLEEP LOGS
-- ============================================================
create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  bed_time timestamptz,
  wake_time timestamptz,
  duration_hours numeric,
  quality int,
  source text default 'manual',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index idx_sleep_user_date on public.sleep_logs (user_id, date desc);

alter table public.sleep_logs enable row level security;
create policy "Users own their sleep" on public.sleep_logs
  for all using (auth.uid() = user_id);

-- ============================================================
-- HEALTH DATA (HealthKit sync)
-- ============================================================
create table public.health_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  metric_type text not null,
  value numeric not null,
  unit text,
  source text default 'healthkit',
  created_at timestamptz not null default now()
);

create index idx_health_user_date on public.health_data (user_id, date desc);

alter table public.health_data enable row level security;
create policy "Users own their health data" on public.health_data
  for all using (auth.uid() = user_id);

-- ============================================================
-- BLAZEPOD SESSIONS
-- ============================================================
create table public.blazepod_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  drill_type text,
  avg_reaction_ms numeric,
  best_reaction_ms numeric,
  total_hits int,
  duration_seconds int,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_blazepod_user on public.blazepod_sessions (user_id, date desc);

alter table public.blazepod_sessions enable row level security;
create policy "Users own their blazepod" on public.blazepod_sessions
  for all using (auth.uid() = user_id);

-- ============================================================
-- PHONE TEST SESSIONS
-- ============================================================
create table public.phone_test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  test_type text not null,
  score numeric,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_phone_test_user on public.phone_test_sessions (user_id, date desc);

alter table public.phone_test_sessions enable row level security;
create policy "Users own their phone tests" on public.phone_test_sessions
  for all using (auth.uid() = user_id);

-- ============================================================
-- VIDEO TEST RESULTS
-- ============================================================
create table public.video_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  test_type text not null,
  scores jsonb,
  video_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_video_test_user on public.video_test_results (user_id, date desc);

alter table public.video_test_results enable row level security;
create policy "Users own their video tests" on public.video_test_results
  for all using (auth.uid() = user_id);

-- ============================================================
-- PADEL PROGRESS
-- ============================================================
create table public.padel_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  shot_type text not null,
  mastery_level int not null default 0,
  last_practiced date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, shot_type)
);

alter table public.padel_progress enable row level security;
create policy "Users own their padel progress" on public.padel_progress
  for all using (auth.uid() = user_id);

-- ============================================================
-- COMPLIANCE RECORDS
-- ============================================================
create table public.compliance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  plan_id uuid references public.plans(id) on delete set null,
  compliant boolean not null,
  actual_effort int,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index idx_compliance_user on public.compliance_records (user_id, date desc);

alter table public.compliance_records enable row level security;
create policy "Users own their compliance" on public.compliance_records
  for all using (auth.uid() = user_id);

-- ============================================================
-- KNOWLEDGE BASE (RAG chunks — pgvector ready)
-- ============================================================
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- No RLS on knowledge_base — it's shared reference data

-- ============================================================
-- FORWARD ROADMAP TABLES (schema created now, populated later)
-- ============================================================

-- Phase 1: Periodization — Training Blocks
create table public.training_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sport text not null,
  block_type text not null
    check (block_type in ('accumulation', 'transmutation', 'realization', 'deload')),
  start_date date not null,
  end_date date,
  focus text,
  week_count int not null default 4,
  deload_week int,
  created_at timestamptz not null default now()
);

create index idx_blocks_user on public.training_blocks (user_id, start_date desc);

alter table public.training_blocks enable row level security;
create policy "Users own their blocks" on public.training_blocks
  for all using (auth.uid() = user_id);

-- Phase 1: Periodization — Weekly Plans
create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.training_blocks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  week_number int not null,
  target_load numeric,
  actual_load numeric,
  acute_load numeric,
  chronic_load numeric,
  acwr numeric, -- Acute:Chronic Workload Ratio
  created_at timestamptz not null default now()
);

create index idx_weekly_user on public.weekly_plans (user_id, created_at desc);

alter table public.weekly_plans enable row level security;
create policy "Users own their weekly plans" on public.weekly_plans
  for all using (auth.uid() = user_id);

-- Phase 1: Workout Logs (sets x reps x weight x RPE)
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  exercise_name text not null,
  sets int,
  reps int,
  weight numeric,
  rpe int,
  duration_seconds int,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_workout_logs_user on public.workout_logs (user_id, created_at desc);

alter table public.workout_logs enable row level security;
create policy "Users own their workout logs" on public.workout_logs
  for all using (auth.uid() = user_id);

-- Phase 2: Dynamic Exercise Library
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text,
  muscle_groups text[] default '{}',
  equipment text,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  video_url text,
  coaching_cues text[] default '{}',
  contraindications text[] default '{}',
  progressions text[] default '{}',
  regressions text[] default '{}',
  created_at timestamptz not null default now()
);

-- No RLS on exercises — shared reference data

-- Phase 4: Nutrition Logs
create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout')),
  photo_url text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  hydration_ml int,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_nutrition_user_date on public.nutrition_logs (user_id, date desc);

alter table public.nutrition_logs enable row level security;
create policy "Users own their nutrition" on public.nutrition_logs
  for all using (auth.uid() = user_id);

-- Phase 3B: Exam Periods
create table public.exam_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  auto_detected boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

create index idx_exam_user on public.exam_periods (user_id, start_date);

alter table public.exam_periods enable row level security;
create policy "Users own their exam periods" on public.exam_periods
  for all using (auth.uid() = user_id);

-- Phase 8: Return-to-Play
create table public.return_to_play (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  injury_date date not null,
  pain_location text,
  current_stage int not null default 1
    check (current_stage between 1 and 5),
  stage_started_at timestamptz not null default now(),
  cleared_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_rtp_user on public.return_to_play (user_id, injury_date desc);

alter table public.return_to_play enable row level security;
create policy "Users own their rtp" on public.return_to_play
  for all using (auth.uid() = user_id);
