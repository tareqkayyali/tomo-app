-- ─────────────────────────────────────────────────────────────────────────
-- Dynamic Hero Coaching — AI-generated contextual copy for the Signal
-- Dashboard's FocusHero card.
-- ─────────────────────────────────────────────────────────────────────────
--
-- Three new columns on athlete_snapshots carry the most recent Haiku
-- generation. Boot reads them; event handlers (check-in, session log, vital
-- reading) invoke the generator which writes the fresh copy here.
--
--   dynamic_coaching                 — the one-sentence copy (≤140 chars).
--   dynamic_coaching_generated_at    — when it was written. Boot treats
--                                      anything older than 6h as stale and
--                                      triggers an async background regen.
--   dynamic_coaching_context_hash    — sha1 of the inputs that produced the
--                                      copy (sport, recent event type/time,
--                                      CCRS level, readiness RAG). Used to
--                                      skip regen when inputs haven't
--                                      changed (e.g. multiple check-ins in a
--                                      short window).
--
-- All three are NULLable — a fresh athlete with no history just falls
-- through to the existing signal-coaching path in the boot route.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE athlete_snapshots
  ADD COLUMN IF NOT EXISTS dynamic_coaching TEXT,
  ADD COLUMN IF NOT EXISTS dynamic_coaching_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dynamic_coaching_context_hash TEXT;
