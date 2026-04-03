-- Migration 028: Add regular_study_config to player_schedule_preferences
-- Stores recurring weekly study schedule configuration (parallel to exam study plan)

ALTER TABLE player_schedule_preferences
ADD COLUMN IF NOT EXISTS regular_study_config jsonb DEFAULT NULL;

-- Example value:
-- {
--   "subjects": ["Math", "Physics"],
--   "days": [1, 2, 3, 4],
--   "sessionDurationMin": 60,
--   "planWeeks": 4
-- }
