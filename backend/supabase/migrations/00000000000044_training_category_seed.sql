-- ============================================================================
-- Migration 044: Seed missing training category templates
-- ============================================================================
--
-- Adds 4 training categories missing from migration 036 seed data.
-- Original seed: club, gym, personal, recovery
-- This adds: individual_technical, tactical, match_competition, mental_performance
--
-- Required for the expanded agent layer where specialized agents (Training Program,
-- Intra-Session, Testing & Benchmark) need to reference the full category taxonomy.
-- ============================================================================

INSERT INTO public.training_category_templates
  (id, label, icon, color, default_mode, default_days_per_week, default_session_duration, default_preferred_time, sort_order)
VALUES
  ('individual_technical', 'Individual Technical', 'body-outline', '#FF9500', 'days_per_week', 2, 45, 'afternoon', 5),
  ('tactical', 'Tactical / Team Shape', 'people-outline', '#5AC8FA', 'fixed_days', 2, 75, 'afternoon', 6),
  ('match_competition', 'Match / Competition', 'trophy-outline', '#FF3B30', 'fixed_days', 1, 90, 'afternoon', 7),
  ('mental_performance', 'Mental Performance', 'flash-outline', '#BF5AF2', 'days_per_week', 1, 30, 'evening', 8)
ON CONFLICT (id) DO NOTHING;
