-- ============================================================
-- calendar_events.metadata — structured provenance JSONB
-- ============================================================
-- Events created by the week-planner need to carry their plan row id +
-- any repair adjustments so the Timeline can narrate "moved from Tue
-- because Tue was full" at tap time — without that data, the "why"
-- lives only in the preview card and vanishes as soon as the athlete
-- closes chat.
--
-- Generic metadata JSONB makes this extensible for other event
-- creators (journal links, external integrations, …) without schema
-- churn.
--
-- Shape written by /api/v1/week-plan/commit:
--   { "week_plan": {
--       "week_plan_id": "<uuid>",
--       "status": "clean" | "adjusted" | "dropped",
--       "adjustments": [{ move, from:{date,startTime}, to:{...}, reason }]
--     } }
-- ============================================================

alter table public.calendar_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Index on any metadata JSON path a consumer hits hot; for now there
-- are no hot queries, so no index.

comment on column public.calendar_events.metadata is
  'Structured provenance + context. Week planner writes metadata.week_plan with plan_id + adjustments so Timeline can narrate repair moves on tap.';
