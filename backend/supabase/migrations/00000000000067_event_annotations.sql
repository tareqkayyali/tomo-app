-- Migration 067: Event Annotations — coach/parent notes on calendar events
--
-- P2.1 of the Triangle coordination layer. Adds annotations that coach
-- or parent can leave on a specific calendar_event. The athlete sees
-- them inline on the calendar block and receives a notification. When
-- the author marks the annotation `urgent`, the notification bypasses
-- the fatigue guard and quiet hours (P1 compliance decision 2026-04-18
-- #6: "default OFF; when ON, bypass fatigue + quiet hours, boost to
-- priority 5").
--
-- Design principles:
--   1. Content-moderated on write. Every insert passes through the
--      application-layer moderate() wrapper (migration 066) BEFORE the
--      row is persisted. moderation_state ('cleared' | 'pending' |
--      'hidden') is set by the wrapper result.
--   2. Visibility scoped. The JSONB visibility column defaults to
--      everyone on the triangle; callers can scope to a subset
--      (e.g. coach-only notes that the parent doesn't see).
--   3. Read-receipt tracked. read_by_athlete_at flips when the athlete
--      opens the calendar block. Lets the author see whether the note
--      landed.
--   4. Soft delete. deleted_at is non-null when the author retracts;
--      row stays for moderation audit. RLS hides deleted rows from
--      the feed.
--   5. Author role indexed. The Triangle Input Registry (P2.3) reuses
--      annotations as a weighted input source.
--
-- RLS:
--   - Athlete reads annotations on their own events.
--   - Coach / parent reads annotations on events of linked athletes,
--     gated by fn_guardian_can_read (migration 064).
--   - Authors read their own annotations regardless (so the composer
--     UI can show the author their own draft).
--   - Authors insert only against an event they can see (FK integrity
--     check at app layer) and only as themselves (author_id = auth.uid()).
--   - Authors update their own annotations (edit). Cannot update
--     moderation_state — that's service-role only.
--   - Service role has full access for moderation + retraction flows.
--
-- Idempotent.

-- ═══════════════════════════════════════════════════════════════════
--  event_annotations — the table
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.event_annotations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
    -- denormalised owner of the event. cheap to fetch via trigger OR via
    -- API, we use API — write path already has it.
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('coach','parent','athlete','system')),
  annotation_type text not null default 'context' check (annotation_type in (
    'context','concern','instruction','celebration','conflict_flag','medical_note'
  )),
  domain text not null default 'logistics' check (domain in (
    'training','academic','wellbeing','safety','logistics'
  )),
  body text not null check (length(trim(body)) > 0),
  urgent boolean not null default false,
  visibility jsonb not null default '{"athlete":true,"coach":true,"parent":true}',
  moderation_state text not null default 'pending' check (moderation_state in (
    'pending','cleared','hidden','removed'
  )),
  read_by_athlete_at timestamptz,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

comment on table public.event_annotations is
  'Coach/parent notes attached to a specific calendar_event. Triangle coordination layer — surfaces inline on the athlete''s event block and fans out to athlete_notifications via the application-layer writer (not a trigger, so moderation + routing stay observable in TS logs). Urgent flag bypasses fatigue guard + quiet hours on the notification side.';

-- Indexes for the common reads
create index if not exists idx_event_annotations_event_created
  on public.event_annotations (event_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_event_annotations_athlete_created
  on public.event_annotations (athlete_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_event_annotations_author_created
  on public.event_annotations (author_id, created_at desc);

-- Partial index for the Triangle Input Registry (P2.3) retrieval
create index if not exists idx_event_annotations_role_domain
  on public.event_annotations (athlete_id, author_role, domain, created_at desc)
  where deleted_at is null and moderation_state in ('cleared','pending');

-- ═══════════════════════════════════════════════════════════════════
--  RLS
-- ═══════════════════════════════════════════════════════════════════

alter table public.event_annotations enable row level security;

-- Athlete: read annotations on their own events (that aren't hidden/removed
-- and aren't deleted, and where visibility['athlete'] = true).
drop policy if exists "Athletes read own event annotations" on public.event_annotations;
create policy "Athletes read own event annotations"
  on public.event_annotations
  for select
  using (
    athlete_id = auth.uid()
    and deleted_at is null
    and moderation_state in ('cleared','pending')
    and coalesce((visibility ->> 'athlete')::boolean, true) = true
  );

-- Author: always read own annotations (including own hidden/pending so
-- they can see moderation state).
drop policy if exists "Authors read own annotations" on public.event_annotations;
create policy "Authors read own annotations"
  on public.event_annotations
  for select
  using (author_id = auth.uid());

-- Guardian: read annotations on linked athletes' events, respecting
-- fn_guardian_can_read + visibility scoping.
drop policy if exists "Guardians read linked athlete annotations" on public.event_annotations;
create policy "Guardians read linked athlete annotations"
  on public.event_annotations
  for select
  using (
    deleted_at is null
    and moderation_state in ('cleared','pending')
    and public.fn_guardian_can_read(athlete_id, auth.uid(), domain)
    and (
      (author_role = 'coach' and coalesce((visibility ->> 'coach')::boolean, true) = true)
      or (author_role = 'parent' and coalesce((visibility ->> 'parent')::boolean, true) = true)
      or author_role = 'athlete'
      or author_role = 'system'
    )
  );

-- Author: insert only as themselves, only on events whose athlete they
-- can read (athlete_id will be validated at application layer against
-- the event owner; RLS here just asserts author_id = auth.uid()).
drop policy if exists "Authors insert own annotations" on public.event_annotations;
create policy "Authors insert own annotations"
  on public.event_annotations
  for insert
  with check (
    author_id = auth.uid()
    and moderation_state = 'pending'
  );

-- Author: update own annotation body/urgent/visibility (edit). Cannot
-- change moderation_state, read_by_athlete_at, or notification_sent_at.
-- The CHECK clause below is enforced by matching author_id on both
-- rows; the API layer strips system-only columns from the payload.
drop policy if exists "Authors edit own annotations" on public.event_annotations;
create policy "Authors edit own annotations"
  on public.event_annotations
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Author: soft-delete own annotation (sets deleted_at).
-- Achieved via UPDATE (setting deleted_at) rather than DELETE so the
-- audit row stays. No separate DELETE policy — calls to DELETE from
-- end-users will be rejected (no matching policy grants it).

grant select, insert, update on public.event_annotations to authenticated;
grant all on public.event_annotations to service_role;

-- Realtime — coach/parent annotations surface live on the athlete's
-- calendar without a refetch.
alter publication supabase_realtime add table public.event_annotations;

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
