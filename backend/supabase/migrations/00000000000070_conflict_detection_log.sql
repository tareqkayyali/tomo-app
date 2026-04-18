-- Migration 070: conflict_detection_log (P3.2, 2026-04-18)
--
-- Every time detectConflict() runs on an event — whether it fires or
-- not — we append a row here. Two purposes:
--   1. Offline training. The current keyword classifier is conservative
--      and will miss subtle disagreements. After ~1k rows we swap to
--      an embedding-similarity v2 per the P3 plan.
--   2. Observability. "Why did the Ask Tomo pill appear on event X"
--      is answered by a SELECT on this table (rationale + axis).
--
-- The classifier wrapper writes; admin reads. Athlete/guardian never
-- see this table.
--
-- Idempotent.

create table if not exists public.conflict_detection_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.calendar_events(id) on delete cascade,
  athlete_id uuid references auth.users(id) on delete cascade,
  annotation_ids uuid[] not null default array[]::uuid[],
  has_conflict boolean not null,
  axis text check (axis in ('intent','timing','load','explicit','unknown')),
  author_roles text[] not null default array[]::text[],
  authors uuid[] not null default array[]::uuid[],
  domains text[] not null default array[]::text[],
  rationale text,
  detector_version text not null default 'keyword_v1',
  created_at timestamptz not null default now()
);

comment on table public.conflict_detection_log is
  'Append-only log of every detectConflict() invocation. Used for offline labelling to graduate the classifier from keyword_v1 to embedding_v2 after ~1k samples. Admin-only read; service-role write.';

create index if not exists idx_conflict_log_event
  on public.conflict_detection_log (event_id, created_at desc);

create index if not exists idx_conflict_log_athlete
  on public.conflict_detection_log (athlete_id, created_at desc);

create index if not exists idx_conflict_log_version_conflict
  on public.conflict_detection_log (detector_version, has_conflict, created_at desc);

alter table public.conflict_detection_log enable row level security;

drop policy if exists "Admins read conflict log" on public.conflict_detection_log;
create policy "Admins read conflict log"
  on public.conflict_detection_log
  for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select on public.conflict_detection_log to authenticated;
grant all on public.conflict_detection_log to service_role;
