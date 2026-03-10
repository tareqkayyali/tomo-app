-- Add missing columns to users table for mobile app compatibility
alter table public.users
  add column if not exists display_name text,
  add column if not exists region text,
  add column if not exists team_id text,
  add column if not exists season_phase text check (season_phase in ('off_season', 'pre_season', 'in_season', 'post_season')),
  add column if not exists weekly_training_days int default 3,
  add column if not exists health_kit_connected boolean default false,
  add column if not exists fcm_token text,
  add column if not exists photo_url text,
  add column if not exists parental_consent boolean default false,
  add column if not exists streak_multiplier numeric default 1;

-- Change sleep_logs bed_time and wake_time from timestamptz to time
-- since the mobile app sends just time strings like "23:00"
alter table public.sleep_logs
  alter column bed_time type time using bed_time::time,
  alter column wake_time type time using wake_time::time;
