-- Migration 049: Canonical training_programs + position_training_matrix + event_linked_programs
--
-- Clean rebuild of the Linked Programs system. Replaces:
--   - the non-existent football_training_programs table
--   - the non-existent position_training_matrix table
--   - the wrong-place schedule_rules.preferences.training_categories.linkedPrograms
--
-- Design principles:
--   1. Sport-agnostic — training_programs.sport_id lets us onboard padel/basketball/etc later
--      without another schema split.
--   2. Chat-eligible flag — admins control which programs the AI can offer via CMS, no code changes.
--   3. Join table on calendar_events — linked programs finally live ON the event,
--      not buried in schedule_rules preferences where they never persisted.
--   4. Native types — jsonb for variable structures (prescriptions, tags), typed primitives
--      everywhere else. Never store scalars inside jsonb when a column will do.
--   5. RLS from day one — public read for active+chat_eligible programs, admin write.
--      event_linked_programs scoped by user_id to match calendar_events.

-- ── 1. training_programs (canonical, multi-sport) ────────────────────────

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid()
);

-- Self-healing: any of the columns below may already exist (brand new
-- table) or may be missing (stale fragment from an earlier experiment).
-- `add column if not exists` makes the migration idempotent against both.
alter table public.training_programs
  add column if not exists sport_id text not null default 'football';
alter table public.training_programs
  add column if not exists name text;
alter table public.training_programs
  add column if not exists category text;
alter table public.training_programs
  add column if not exists type text;
alter table public.training_programs
  add column if not exists description text not null default '';
alter table public.training_programs
  add column if not exists equipment jsonb not null default '[]'::jsonb;
alter table public.training_programs
  add column if not exists duration_minutes int not null default 30;
alter table public.training_programs
  add column if not exists duration_weeks int not null default 4;
alter table public.training_programs
  add column if not exists position_emphasis jsonb not null default '[]'::jsonb;
alter table public.training_programs
  add column if not exists difficulty text not null default 'intermediate';
alter table public.training_programs
  add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.training_programs
  add column if not exists prescriptions jsonb not null default '{}'::jsonb;
alter table public.training_programs
  add column if not exists phv_guidance jsonb not null default '{}'::jsonb;
alter table public.training_programs
  add column if not exists active boolean not null default true;
alter table public.training_programs
  add column if not exists chat_eligible boolean not null default true;
alter table public.training_programs
  add column if not exists sort_order int not null default 100;
alter table public.training_programs
  add column if not exists created_at timestamptz not null default now();
alter table public.training_programs
  add column if not exists updated_at timestamptz not null default now();

-- Tighten NOT NULL on the core required columns after backfilling defaults.
-- If the table was stale and had rows without these fields, fall back by
-- stamping placeholder values so the NOT NULL constraint can be applied.
update public.training_programs set name = coalesce(name, 'unnamed') where name is null;
update public.training_programs set category = coalesce(category, 'general') where category is null;
update public.training_programs set type = coalesce(type, 'physical') where type is null;

alter table public.training_programs alter column name set not null;
alter table public.training_programs alter column category set not null;
alter table public.training_programs alter column type set not null;

-- Check constraints (add if missing). Wrapped in do blocks because
-- `alter table add constraint if not exists` isn't supported in Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_type_check'
  ) then
    alter table public.training_programs
      add constraint training_programs_type_check
      check (type in ('physical', 'technical'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_duration_minutes_check'
  ) then
    alter table public.training_programs
      add constraint training_programs_duration_minutes_check
      check (duration_minutes > 0 and duration_minutes <= 240);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_duration_weeks_check'
  ) then
    alter table public.training_programs
      add constraint training_programs_duration_weeks_check
      check (duration_weeks > 0 and duration_weeks <= 52);
  end if;
end$$;

-- Unique (sport_id, name) -- required for the seed script's ON CONFLICT.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_sport_id_name_key'
  ) then
    alter table public.training_programs
      add constraint training_programs_sport_id_name_key
      unique (sport_id, name);
  end if;
end$$;

create index if not exists training_programs_sport_category_idx
  on public.training_programs (sport_id, category)
  where active = true;

create index if not exists training_programs_chat_eligible_idx
  on public.training_programs (chat_eligible)
  where active = true and chat_eligible = true;

create index if not exists training_programs_type_idx
  on public.training_programs (type)
  where active = true;

-- Updated_at trigger
create or replace function public.set_training_programs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_programs_updated_at on public.training_programs;
create trigger training_programs_updated_at
  before update on public.training_programs
  for each row execute function public.set_training_programs_updated_at();

comment on table public.training_programs is
  'Canonical training programs catalog. Multi-sport via sport_id. Replaces the hardcoded footballPrograms.ts. Admin-managed via /admin/programs, consumed by the AI chat (via chat_eligible flag) and the rec engine.';


-- ── 2. position_training_matrix ──────────────────────────────────────────

create table if not exists public.position_training_matrix (
  id uuid primary key default gen_random_uuid()
);

-- Stale-fragment guard: if the table pre-existed without an id column,
-- the create above was a no-op. Add id + PK explicitly.
alter table public.position_training_matrix
  add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.position_training_matrix'::regclass and contype = 'p'
  ) then
    alter table public.position_training_matrix add primary key (id);
  end if;
end$$;

alter table public.position_training_matrix
  add column if not exists sport_id text not null default 'football';
alter table public.position_training_matrix
  add column if not exists position text;
alter table public.position_training_matrix
  add column if not exists gps_targets jsonb not null default '{}'::jsonb;
alter table public.position_training_matrix
  add column if not exists strength_targets jsonb not null default '{}'::jsonb;
alter table public.position_training_matrix
  add column if not exists speed_targets jsonb not null default '{}'::jsonb;
alter table public.position_training_matrix
  add column if not exists mandatory_programs jsonb not null default '[]'::jsonb;
alter table public.position_training_matrix
  add column if not exists recommended_programs jsonb not null default '[]'::jsonb;
alter table public.position_training_matrix
  add column if not exists weekly_structure jsonb not null default '{}'::jsonb;
alter table public.position_training_matrix
  add column if not exists created_at timestamptz not null default now();
alter table public.position_training_matrix
  add column if not exists updated_at timestamptz not null default now();

update public.position_training_matrix set position = coalesce(position, 'unknown') where position is null;
alter table public.position_training_matrix alter column position set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'position_training_matrix_sport_id_position_key'
  ) then
    alter table public.position_training_matrix
      add constraint position_training_matrix_sport_id_position_key
      unique (sport_id, position);
  end if;
end$$;

create index if not exists position_training_matrix_sport_idx
  on public.position_training_matrix (sport_id);

comment on table public.position_training_matrix is
  'Position-specific training targets + mandatory/recommended program IDs. Consumed by programRecommendationEngine. One row per (sport, position) pair.';


-- ── 3. event_linked_programs (join table) ────────────────────────────────

create table if not exists public.event_linked_programs (
  id uuid primary key default gen_random_uuid()
);

-- Stale-fragment guard: ensure id + PK exist even if a partial table pre-existed.
alter table public.event_linked_programs
  add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_linked_programs'::regclass and contype = 'p'
  ) then
    alter table public.event_linked_programs add primary key (id);
  end if;
end$$;

alter table public.event_linked_programs
  add column if not exists event_id uuid;
alter table public.event_linked_programs
  add column if not exists program_id uuid;
alter table public.event_linked_programs
  add column if not exists user_id uuid;
alter table public.event_linked_programs
  add column if not exists linked_by text not null default 'user';
alter table public.event_linked_programs
  add column if not exists linked_at timestamptz not null default now();

-- Drop any orphan rows that would block NOT NULL / FK constraints after a
-- stale-fragment upgrade. Safe because the table is new in this migration.
delete from public.event_linked_programs
  where event_id is null or program_id is null or user_id is null;

alter table public.event_linked_programs alter column event_id set not null;
alter table public.event_linked_programs alter column program_id set not null;
alter table public.event_linked_programs alter column user_id set not null;

-- Foreign keys (conditional — named so we can detect pre-existence)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_linked_programs_event_id_fkey'
  ) then
    alter table public.event_linked_programs
      add constraint event_linked_programs_event_id_fkey
      foreign key (event_id) references public.calendar_events(id) on delete cascade;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_linked_programs_program_id_fkey'
  ) then
    alter table public.event_linked_programs
      add constraint event_linked_programs_program_id_fkey
      foreign key (program_id) references public.training_programs(id) on delete restrict;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_linked_programs_user_id_fkey'
  ) then
    alter table public.event_linked_programs
      add constraint event_linked_programs_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_linked_programs_linked_by_check'
  ) then
    alter table public.event_linked_programs
      add constraint event_linked_programs_linked_by_check
      check (linked_by in ('user', 'tomo', 'admin'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_linked_programs_event_id_program_id_key'
  ) then
    alter table public.event_linked_programs
      add constraint event_linked_programs_event_id_program_id_key
      unique (event_id, program_id);
  end if;
end$$;

create index if not exists event_linked_programs_event_idx
  on public.event_linked_programs (event_id);

create index if not exists event_linked_programs_user_idx
  on public.event_linked_programs (user_id, linked_at desc);

create index if not exists event_linked_programs_program_idx
  on public.event_linked_programs (program_id);

comment on table public.event_linked_programs is
  'Join table linking calendar_events to training_programs. Replaces the schedule_rules.preferences.linkedPrograms anti-pattern. Always scoped to event.user_id.';


-- ── RLS ─────────────────────────────────────────────────────────────────

-- training_programs: public read of active+chat_eligible (so mobile search works),
-- admin-only write. The admin check mirrors the pattern used elsewhere in the app.
alter table public.training_programs enable row level security;

drop policy if exists training_programs_public_read on public.training_programs;
create policy training_programs_public_read
  on public.training_programs for select
  using (active = true);

drop policy if exists training_programs_admin_write on public.training_programs;
create policy training_programs_admin_write
  on public.training_programs for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.is_admin = true
    )
  );

-- position_training_matrix: public read, admin write
alter table public.position_training_matrix enable row level security;

drop policy if exists position_training_matrix_public_read on public.position_training_matrix;
create policy position_training_matrix_public_read
  on public.position_training_matrix for select
  using (true);

drop policy if exists position_training_matrix_admin_write on public.position_training_matrix;
create policy position_training_matrix_admin_write
  on public.position_training_matrix for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.is_admin = true
    )
  );

-- event_linked_programs: user owns their rows, admins bypass (via service role)
alter table public.event_linked_programs enable row level security;

drop policy if exists event_linked_programs_owner_read on public.event_linked_programs;
create policy event_linked_programs_owner_read
  on public.event_linked_programs for select
  using (auth.uid() = user_id);

drop policy if exists event_linked_programs_owner_write on public.event_linked_programs;
create policy event_linked_programs_owner_write
  on public.event_linked_programs for insert
  with check (auth.uid() = user_id);

drop policy if exists event_linked_programs_owner_delete on public.event_linked_programs;
create policy event_linked_programs_owner_delete
  on public.event_linked_programs for delete
  using (auth.uid() = user_id);


-- ── Seed is handled by the TypeScript seed script ───────────────────────
-- Run: cd backend && npx tsx scripts/seeds/seed_training_programs.ts
--
-- Kept out of SQL because the prescription scaling helpers live in
-- TypeScript and change over time. The seed is idempotent (UPSERT on
-- (sport_id, name)) so it can be re-run safely after any catalog edit.
