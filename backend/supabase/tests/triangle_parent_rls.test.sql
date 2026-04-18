-- Triangle Parent RLS — SQL-level smoke tests.
--
-- Run against local Supabase:
--   cd backend
--   ./scripts/switch-env.sh local
--   npx supabase db reset
--   psql "$SUPABASE_DB_URL" -f supabase/tests/triangle_parent_rls.test.sql
--
-- Tests use DO blocks with RAISE NOTICE + RAISE EXCEPTION so a failure
-- aborts the run with a clear message. The harness is intentionally
-- zero-dependency: no testing framework, no fixtures loaded from files
-- — every row this script needs is created inline and rolled back at
-- the end so the local DB is unchanged.

begin;

-- ── Stage test users ───────────────────────────────────────────────
-- Athletes: t1_child (8yo), t2_minor (14yo), t3_adult (20yo)
-- Guardians: t1_parent, t2_parent, t3_parent, t3_coach, stranger

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 't1_child@test'),
  ('22222222-2222-2222-2222-222222222222', 't2_minor@test'),
  ('33333333-3333-3333-3333-333333333333', 't3_adult@test'),
  ('44444444-4444-4444-4444-444444444444', 't1_parent@test'),
  ('55555555-5555-5555-5555-555555555555', 't2_parent@test'),
  ('66666666-6666-6666-6666-666666666666', 't3_parent@test'),
  ('77777777-7777-7777-7777-777777777777', 't3_coach@test'),
  ('88888888-8888-8888-8888-888888888888', 'stranger@test')
on conflict (id) do nothing;

insert into public.users (id, email, role, date_of_birth, consent_status)
values
  ('11111111-1111-1111-1111-111111111111', 't1_child@test',  'player', current_date - interval '8 years',  'active'),
  ('22222222-2222-2222-2222-222222222222', 't2_minor@test',  'player', current_date - interval '14 years', 'active'),
  ('33333333-3333-3333-3333-333333333333', 't3_adult@test',  'player', current_date - interval '20 years', 'active'),
  ('44444444-4444-4444-4444-444444444444', 't1_parent@test', 'parent', current_date - interval '40 years', 'active'),
  ('55555555-5555-5555-5555-555555555555', 't2_parent@test', 'parent', current_date - interval '40 years', 'active'),
  ('66666666-6666-6666-6666-666666666666', 't3_parent@test', 'parent', current_date - interval '40 years', 'active'),
  ('77777777-7777-7777-7777-777777777777', 't3_coach@test',  'coach',  current_date - interval '40 years', 'active'),
  ('88888888-8888-8888-8888-888888888888', 'stranger@test',  'parent', current_date - interval '40 years', 'active')
on conflict (id) do update set
  date_of_birth = excluded.date_of_birth,
  role = excluded.role,
  consent_status = excluded.consent_status;

insert into public.relationships (player_id, guardian_id, relationship_type, status)
values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'parent', 'accepted'),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'parent', 'accepted'),
  ('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 'parent', 'accepted'),
  ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'coach',  'accepted')
on conflict do nothing;

-- ── 1. Tier derivation ────────────────────────────────────────────
do $$
declare
  got text;
begin
  select get_age_tier((select date_of_birth from public.users where id = '11111111-1111-1111-1111-111111111111')) into got;
  if got <> 'T1' then raise exception '1a. expected T1 for 8yo, got %', got; end if;

  select get_age_tier((select date_of_birth from public.users where id = '22222222-2222-2222-2222-222222222222')) into got;
  if got <> 'T2' then raise exception '1b. expected T2 for 14yo, got %', got; end if;

  select get_age_tier((select date_of_birth from public.users where id = '33333333-3333-3333-3333-333333333333')) into got;
  if got <> 'T3' then raise exception '1c. expected T3 for 20yo, got %', got; end if;

  select get_age_tier(null) into got;
  if got <> 'UNKNOWN' then raise exception '1d. expected UNKNOWN for null DOB, got %', got; end if;

  raise notice '1. tier derivation … OK';
end $$;

-- ── 2. fn_guardian_can_read: T1/T2 accepted relationship ──────────
do $$
declare
  got boolean;
begin
  select fn_guardian_can_read(
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    null
  ) into got;
  if not got then raise exception '2a. T1 parent with accepted relationship should be true'; end if;

  select fn_guardian_can_read(
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    'training'
  ) into got;
  if not got then raise exception '2b. T2 parent domain=training should be true'; end if;

  raise notice '2. T1/T2 parent visibility default … OK';
end $$;

-- ── 3. fn_guardian_can_read: T3 without opt-in → false ────────────
do $$
declare
  got boolean;
begin
  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '66666666-6666-6666-6666-666666666666',
    'training'
  ) into got;
  if got then raise exception '3a. T3 parent without opt-in should be false'; end if;

  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-7777-7777-777777777777',
    'training'
  ) into got;
  if got then raise exception '3b. T3 coach without opt-in should be false'; end if;

  raise notice '3. T3 fail-closed default … OK';
end $$;

-- ── 4. T3 with opt-in → true for that domain only ─────────────────
do $$
declare
  got boolean;
begin
  insert into public.player_visibility_preferences (player_id, guardian_id, domain, visible)
  values ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'training', true)
  on conflict (player_id, guardian_id, domain) do update set visible = true;

  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-7777-7777-777777777777',
    'training'
  ) into got;
  if not got then raise exception '4a. T3 coach with training opt-in should be true'; end if;

  -- Other domain still blocked.
  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-7777-7777-777777777777',
    'wellbeing'
  ) into got;
  if got then raise exception '4b. T3 coach without wellbeing opt-in should be false'; end if;

  raise notice '4. T3 per-domain opt-in … OK';
end $$;

-- ── 5. Stranger (no relationship) → false in every tier ───────────
do $$
declare
  got boolean;
begin
  select fn_guardian_can_read(
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888888',
    null
  ) into got;
  if got then raise exception '5a. stranger → T1 child should be false'; end if;

  select fn_guardian_can_read(
    '22222222-2222-2222-2222-222222222222',
    '88888888-8888-8888-8888-888888888888',
    'training'
  ) into got;
  if got then raise exception '5b. stranger → T2 minor should be false'; end if;

  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '88888888-8888-8888-8888-888888888888',
    'training'
  ) into got;
  if got then raise exception '5c. stranger → T3 adult should be false'; end if;

  raise notice '5. stranger rejection across tiers … OK';
end $$;

-- ── 6. Self-read (player_id = guardian_id) → true (edge case) ─────
do $$
declare
  got boolean;
begin
  select fn_guardian_can_read(
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'training'
  ) into got;
  if not got then raise exception '6a. self-read should be true'; end if;

  raise notice '6. self-read bypass … OK';
end $$;

-- ── 7. UNKNOWN tier → treated as T2 (Apple 5.1.4 conservative) ────
do $$
declare
  got boolean;
begin
  update public.users set date_of_birth = null where id = '22222222-2222-2222-2222-222222222222';

  select fn_guardian_can_read(
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    'training'
  ) into got;
  if not got then raise exception '7a. UNKNOWN tier should default T2 (visible)'; end if;

  raise notice '7. UNKNOWN tier conservative default … OK';
end $$;

rollback;

\echo ''
\echo '=== triangle_parent_rls.test.sql: all assertions passed ==='
