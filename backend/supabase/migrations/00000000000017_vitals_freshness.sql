-- Add vitals freshness tracking timestamps to athlete_snapshots
ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS hrv_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_recorded_at timestamptz;
