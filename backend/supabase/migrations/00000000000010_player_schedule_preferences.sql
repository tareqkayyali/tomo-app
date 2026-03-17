-- Player Schedule Preferences
-- Single source of truth for all scheduling rules per user.
-- Consumed by the schedule rule engine, plan generators, and AI agents.

create table if not exists player_schedule_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- School
  school_days int[] default '{0,1,2,3,4}',  -- Sun-Thu (Middle East default)
  school_start text default '08:00',
  school_end text default '15:00',

  -- Sleep (determines day bounds)
  sleep_start text default '22:00',    -- bedtime
  sleep_end text default '06:00',      -- wake time

  -- Buffers
  buffer_default_min int default 30,
  buffer_post_match_min int default 60,
  buffer_post_high_intensity_min int default 45,

  -- Day bounds (derived from sleep, but overridable)
  day_bounds_start text default '06:00',
  day_bounds_end text default '22:00',

  -- Study
  study_days int[] default '{0,1,2,3}',
  study_start text default '16:00',
  study_duration_min int default 45,

  -- Gym
  gym_days int[] default '{0,1,2,3,4,5,6}',
  gym_start text default '18:00',
  gym_duration_min int default 60,

  -- Club
  club_days int[] default '{1,3,5}',
  club_start text default '19:30',

  -- Personal dev
  personal_dev_days int[] default '{5,6}',
  personal_dev_start text default '17:00',

  -- Scenario flags
  league_is_active boolean default false,
  exam_period_active boolean default false,

  -- Exam details
  exam_subjects text[] default '{}',
  exam_start_date text,
  pre_exam_study_weeks int default 3,
  days_per_subject int default 3,

  -- Training categories (JSONB for flexible schema)
  training_categories jsonb default '[
    {"id":"club","label":"Club / Academy","icon":"football-outline","color":"#FF6B35","enabled":true,"mode":"fixed_days","fixedDays":[1,3,5],"daysPerWeek":3,"sessionDuration":90,"preferredTime":"afternoon"},
    {"id":"gym","label":"Gym","icon":"barbell-outline","color":"#00D9FF","enabled":true,"mode":"days_per_week","fixedDays":[],"daysPerWeek":2,"sessionDuration":60,"preferredTime":"morning"},
    {"id":"personal","label":"Personal","icon":"fitness-outline","color":"#30D158","enabled":false,"mode":"days_per_week","fixedDays":[],"daysPerWeek":1,"sessionDuration":60,"preferredTime":"evening"}
  ]'::jsonb,

  -- Exam schedule (JSONB array)
  exam_schedule jsonb default '[]'::jsonb,

  -- Study subjects (text array)
  study_subjects text[] default '{}',

  updated_at timestamptz default now()
);

-- RLS
alter table player_schedule_preferences enable row level security;

create policy "Users manage own preferences"
  on player_schedule_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
