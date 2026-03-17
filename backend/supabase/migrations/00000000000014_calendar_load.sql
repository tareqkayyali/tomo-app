-- ============================================================================
-- Migration 014: Calendar Load Estimation — Phase 3 Planning Layer
-- Adds estimated_load_au to calendar_events so scheduled sessions carry
-- forward-looking load predictions before they are completed.
-- ============================================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS estimated_load_au DECIMAL(8,1) DEFAULT NULL;

COMMENT ON COLUMN public.calendar_events.estimated_load_au IS
  'Estimated training load in arbitrary units. Computed from intensity x duration. NULL for non-training events.';

-- Index for forward-looking load queries (sum estimated load for next N days)
CREATE INDEX IF NOT EXISTS idx_calendar_estimated_load
  ON public.calendar_events (user_id, start_at)
  WHERE estimated_load_au IS NOT NULL;
