-- Add school_hours_quiet toggle to notification preferences
-- When true (default), push notifications are queued during school hours
ALTER TABLE athlete_notification_preferences
  ADD COLUMN IF NOT EXISTS school_hours_quiet boolean DEFAULT true;
