-- Add "football" as an accepted sport value
-- The mobile app uses "football" while the DB was created with "soccer"
-- Both values are now accepted for backward compatibility

-- 1. Drop the existing CHECK constraint and recreate with "football" included
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_sport_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_sport_check
  CHECK (sport IN ('football', 'soccer', 'basketball', 'tennis', 'padel'));

-- 2. Change the default from 'soccer' to 'football'
ALTER TABLE public.users
  ALTER COLUMN sport SET DEFAULT 'football';
