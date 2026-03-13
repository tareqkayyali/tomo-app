-- ============================================================
-- Add intensity and sport columns to calendar_events
-- ============================================================
-- These columns were missing from the original schema.
-- The backend API now stores and returns them.

alter table public.calendar_events
  add column if not exists intensity text
    check (intensity is null or intensity in ('REST', 'LIGHT', 'MODERATE', 'HARD'));

alter table public.calendar_events
  add column if not exists sport text
    check (sport is null or sport in ('football', 'padel', 'general', 'basketball', 'tennis'));

-- Also update the event_type check constraint to accept 'study_block' as alias
-- (Backend normalises to 'study' on write, but this makes direct inserts safer)
-- The existing constraint only allows: training, match, recovery, study, exam, other
-- No change needed — backend maps study_block → study before insert.
