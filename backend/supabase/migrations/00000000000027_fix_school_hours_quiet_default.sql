-- Add school_hours_quiet as opt-in (DEFAULT false).
-- Migration 026 was never applied to production, so we add the column directly here
-- with the correct default (false = opt-in, not opt-out).
-- pushDelivery.ts checks: preferences.school_hours_quiet === true → skip if false/absent.

ALTER TABLE athlete_notification_preferences
  ADD COLUMN IF NOT EXISTS school_hours_quiet boolean DEFAULT false;
