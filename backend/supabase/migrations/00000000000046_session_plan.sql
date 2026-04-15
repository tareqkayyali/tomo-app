-- ============================================================
-- Session Plan on Calendar Events
-- ============================================================
-- Adds a structured `session_plan` JSONB column to calendar_events.
-- Populated by the AI multi_step build_session flow; rendered by the
-- mobile EventEditScreen in a dedicated "Session Plan" block (read-only).
--
-- Schema of the JSONB payload (enforced at the application layer):
--
-- {
--   "builtBy": "tomo",
--   "focus": "endurance" | "strength" | "speed" | "technical" | ...,
--   "totalMinutes": 45,
--   "drills": [
--     {
--       "name": "Tempo Run Intervals",
--       "category": "endurance",
--       "durationMin": 10,
--       "intensity": "MODERATE" | "LIGHT" | "HARD",
--       "description": "..."
--     },
--     ...
--   ]
-- }
--
-- Before this migration drills built via chat were stored as a flat
-- markdown blob in `calendar_events.notes`. That overloaded the notes
-- field (which should belong to the athlete) and made structured UI
-- rendering impossible. Drills now live in session_plan; notes stays
-- free-text.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS session_plan JSONB;

-- Lightweight index: GIN on the whole column. Allows fast lookups like
-- "all events with a session_plan" without forcing any structural lock-in.
CREATE INDEX IF NOT EXISTS idx_calendar_events_session_plan
  ON public.calendar_events USING GIN (session_plan)
  WHERE session_plan IS NOT NULL;
