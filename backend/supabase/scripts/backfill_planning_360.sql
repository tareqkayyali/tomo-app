-- ============================================================================
-- Backfill: Planning 360 Fields
-- ============================================================================
-- One-time backfill script for the Planning 360 feature.
-- Populates athlete_mode, wearable status, and injury detail fields
-- from existing legacy data sources.
--
-- Safe to run multiple times — all UPDATE statements use WHERE ... IS NULL
-- guards to skip rows that have already been backfilled.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================================

-- 1. Backfill athlete_mode on athlete_snapshots from legacy scenario flags
UPDATE athlete_snapshots AS s
SET athlete_mode = CASE
  WHEN p.league_is_active AND p.exam_period_active THEN 'league'
  WHEN p.league_is_active THEN 'league'
  WHEN p.exam_period_active THEN 'study'
  ELSE 'balanced'
END,
mode_changed_at = NOW()
FROM player_schedule_preferences AS p
WHERE s.athlete_id = p.user_id
AND s.athlete_mode IS NULL;

-- 2. Backfill athlete_mode on player_schedule_preferences (default mapping)
UPDATE player_schedule_preferences
SET athlete_mode = CASE
  WHEN league_is_active AND exam_period_active THEN 'league'
  WHEN league_is_active THEN 'league'
  WHEN exam_period_active THEN 'study'
  ELSE 'balanced'
END,
mode_changed_at = NOW()
WHERE athlete_mode IS NULL;

-- 3. Backfill wearable status from athlete_daily_vitals
--    Connected = has vitals data within the last 48 hours
UPDATE athlete_snapshots AS s
SET
  wearable_connected = (v.latest_date > NOW() - INTERVAL '48 hours'),
  wearable_last_sync_at = v.latest_date
FROM (
  SELECT athlete_id, MAX(vitals_date::timestamptz) AS latest_date
  FROM athlete_daily_vitals
  GROUP BY athlete_id
) v
WHERE s.athlete_id = v.athlete_id
AND s.wearable_connected IS NULL;

-- 4. Initialize injury detail fields for healthy athletes
--    Only sets defaults where no injury data exists and readiness is GREEN
UPDATE athlete_snapshots
SET active_injury_count = 0,
    injury_locations = '[]'::jsonb
WHERE active_injury_count IS NULL
AND injury_risk_flag = 'GREEN';
