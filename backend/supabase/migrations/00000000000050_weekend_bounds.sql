-- Migration 050: Add weekend-specific available hours
-- Extends player_schedule_preferences with separate weekend bounds.
-- Existing day_bounds_start/end become the weekday bounds.
-- When weekend_bounds_* are NULL, the system falls back to day_bounds_*.
--
-- NOTE: player_schedule_preferences was created by an earlier migration
-- with integer[] for day columns, text[] for subject columns, and date
-- for exam_start_date. This migration only ADDs the weekend columns.

ALTER TABLE public.player_schedule_preferences
  ADD COLUMN IF NOT EXISTS weekend_bounds_start text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weekend_bounds_end   text DEFAULT NULL;

COMMENT ON COLUMN public.player_schedule_preferences.day_bounds_start IS 'Earliest schedulable time on weekdays (HH:MM). Also serves as universal fallback.';
COMMENT ON COLUMN public.player_schedule_preferences.day_bounds_end IS 'Latest schedulable time on weekdays (HH:MM). Also serves as universal fallback.';
COMMENT ON COLUMN public.player_schedule_preferences.weekend_bounds_start IS 'Earliest schedulable time on weekends (HH:MM). Falls back to day_bounds_start when NULL.';
COMMENT ON COLUMN public.player_schedule_preferences.weekend_bounds_end IS 'Latest schedulable time on weekends (HH:MM). Falls back to day_bounds_end when NULL.';
