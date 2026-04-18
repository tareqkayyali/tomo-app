-- Migration 064: Triangle Parent RLS + Visibility Preferences
--
-- Closes the parent-visibility security gap identified in the Triangle
-- portal audit (2026-04-18). Before this migration:
--   - athlete_snapshots, athlete_daily_load, training_journals had
--     coach read policies but NO parent read policy — parent portal
--     worked via service_role bypass in the API, not JWT.
--   - athlete_daily_vitals / benchmark_cache / weekly_digest /
--     monthly_summary had ONLY service_role policies — nothing
--     readable by athlete or guardian via JWT.
--   - calendar_events, checkins had athlete-only policies — coach and
--     parent read via service_role only.
--
-- This migration:
--   1. Adds a reusable SECURITY DEFINER function
--      public.fn_guardian_can_read(player_id, guardian_id, domain) that
--      centralises the tier-aware visibility rule. T1/T2 → visibility
--      default true when relationship is accepted; T3 → requires per-
--      domain opt-in in player_visibility_preferences.
--   2. Creates player_visibility_preferences with fail-closed defaults
--      for T3 (UK Children's Code Standard 7: minimum-default).
--   3. Creates access_denial_log for observability (no silent failures).
--   4. Adds parent SELECT policies mirroring existing coach policies on
--      athlete_snapshots, athlete_daily_load, training_journals.
--   5. Adds Triangle (athlete + coach + parent) SELECT policies on the
--      unified-data-layer tables (athlete_daily_vitals, benchmark_cache,
--      weekly_digest, monthly_summary).
--   6. Adds guardian (coach + parent) SELECT policies on calendar_events
--      and checkins.
--
-- Non-targets (explicit decisions):
--   - athlete_longitudinal_memory — AI's private memory of the athlete,
--     not for guardian view. No parent/coach policy added.
--   - chat_messages / chat_session_summaries — athlete's private chat
--     with the AI. Not for guardian view.
--   - health_data / sleep_logs — biometric sensitivity; deferred until
--     per-domain opt-in UI ships (P4). Existing athlete-only policy
--     stays.
--   - Training artifact tables (training_programs, drills, exercises)
--     — catalog data, coach already writes, not per-athlete scoped.
--
-- Compliance linkage:
--   - COPPA §312.4: lawful disclosure to parent after verifiable consent.
--     Function gates on `consent_status='active'` for T1 implicitly via
--     the existing consent_gate trigger on downstream writes.
--   - GDPR Art. 8: parent is consent-holder for <16 (locked 16 EU-wide).
--   - Apple 5.1.1(iii): data minimisation — per-domain visibility
--     (training/academic/wellbeing/...) instead of blanket visibility.
--   - UK Children's Code Standard 7: default minimum visibility for T3.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every CREATE POLICY is
-- paired with DROP POLICY IF EXISTS, every CREATE OR REPLACE for
-- functions.

-- ═══════════════════════════════════════════════════════════════════
--  Part 1: Visibility preferences (T3 opt-in matrix)
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.player_visibility_preferences (
  player_id uuid not null references public.users(id) on delete cascade,
  guardian_id uuid not null references public.users(id) on delete cascade,
  domain text not null check (domain in (
    'training','academic','wellbeing','safety','logistics','cv'
  )),
  visible boolean not null default false,
  parent_approval_required boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, guardian_id, domain)
);

comment on table public.player_visibility_preferences is
  'Per-domain visibility matrix for T3 athletes (age >= 16). T3 defaults to visible=false for every (guardian, domain) pair — athlete must explicitly opt in. T1/T2 visibility defaults true via fn_guardian_can_read bypass; this table only applies when age_tier = T3.';

create index if not exists idx_pvp_player on public.player_visibility_preferences (player_id);
create index if not exists idx_pvp_guardian on public.player_visibility_preferences (guardian_id);

alter table public.player_visibility_preferences enable row level security;

drop policy if exists "Athletes manage own visibility prefs" on public.player_visibility_preferences;
create policy "Athletes manage own visibility prefs"
  on public.player_visibility_preferences
  for all
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

drop policy if exists "Guardians read own visibility prefs" on public.player_visibility_preferences;
create policy "Guardians read own visibility prefs"
  on public.player_visibility_preferences
  for select
  using (guardian_id = auth.uid());

grant select on public.player_visibility_preferences to authenticated;
grant insert, update, delete on public.player_visibility_preferences to authenticated;
grant all on public.player_visibility_preferences to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  Part 2: Access denial observability
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.access_denial_log (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid,
  viewer_role text,
  target_type text not null,   -- 'athlete_snapshots','calendar_events', …
  target_id uuid,
  target_owner_id uuid,
  reason text,                 -- 'no_relationship','t3_visibility_off','consent_revoked', …
  domain text,
  created_at timestamptz not null default now()
);

comment on table public.access_denial_log is
  'Every RLS / application-layer access denial gets a row here. No silent failures. Used by observability dashboards to detect broken policies, attack probes, and UX regressions (e.g. T3 athletes who revoked coach visibility but coach UI still tries to read).';

create index if not exists idx_adl_viewer_created on public.access_denial_log (viewer_id, created_at desc);
create index if not exists idx_adl_target_created on public.access_denial_log (target_type, created_at desc);

alter table public.access_denial_log enable row level security;

-- Only service_role writes; only admins read.
drop policy if exists "Admins read access denials" on public.access_denial_log;
create policy "Admins read access denials"
  on public.access_denial_log
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

grant all on public.access_denial_log to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  Part 3: fn_guardian_can_read — centralised visibility rule
-- ═══════════════════════════════════════════════════════════════════

-- SECURITY DEFINER so it can read users.date_of_birth + relationships
-- even when the caller's JWT can only select their own row on users.
-- The function never returns data — only boolean — so it cannot be used
-- to exfiltrate PII.
create or replace function public.fn_guardian_can_read(
  p_player_id uuid,
  p_guardian_id uuid,
  p_domain text default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_accepted boolean;
  v_opted_in boolean;
begin
  -- Caller never authorised for the owner path.
  if p_player_id = p_guardian_id then
    return true;
  end if;

  -- Relationship must be accepted.
  select exists (
    select 1 from public.relationships r
    where r.player_id = p_player_id
      and r.guardian_id = p_guardian_id
      and r.status = 'accepted'
  ) into v_accepted;

  if not v_accepted then
    return false;
  end if;

  -- Tier derived from the player's DOB. UNKNOWN → treat as T2 (Apple
  -- 5.1.4 conservative default: guardian can still read, athlete is
  -- still a minor).
  select public.get_age_tier(u.date_of_birth) into v_tier
  from public.users u
  where u.id = p_player_id;

  if v_tier is null or v_tier = 'UNKNOWN' then
    v_tier := 'T2';
  end if;

  -- T1 / T2: visibility default true when relationship accepted.
  if v_tier in ('T1', 'T2') then
    return true;
  end if;

  -- T3: requires explicit per-domain opt-in. If p_domain is NULL the
  -- caller is asking "any visibility"; fall through to any-row-visible
  -- check.
  if p_domain is not null then
    select coalesce(visible, false) into v_opted_in
    from public.player_visibility_preferences
    where player_id = p_player_id
      and guardian_id = p_guardian_id
      and domain = p_domain;

    return coalesce(v_opted_in, false);
  else
    select exists (
      select 1 from public.player_visibility_preferences
      where player_id = p_player_id
        and guardian_id = p_guardian_id
        and visible = true
    ) into v_opted_in;

    return coalesce(v_opted_in, false);
  end if;
end;
$$;

comment on function public.fn_guardian_can_read(uuid, uuid, text) is
  'Central Triangle visibility rule. Returns true if guardian may read any data owned by player. T1/T2 → true when relationship accepted (parent authority, UK Children''s Code Standard 4). T3 → requires opt-in row in player_visibility_preferences for the given domain (Standard 7 minimum-default). Called from every parent/coach SELECT policy that added to this migration.';

grant execute on function public.fn_guardian_can_read(uuid, uuid, text) to authenticated;
grant execute on function public.fn_guardian_can_read(uuid, uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  Part 4: Parent policies on existing coach-covered tables
-- ═══════════════════════════════════════════════════════════════════

-- ── athlete_snapshots ──────────────────────────────────────────────
drop policy if exists "Parents read linked athlete snapshots" on public.athlete_snapshots;
create policy "Parents read linked athlete snapshots"
  on public.athlete_snapshots
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), null));

-- ── athlete_daily_load ─────────────────────────────────────────────
drop policy if exists "Parents read linked athlete daily load" on public.athlete_daily_load;
create policy "Parents read linked athlete daily load"
  on public.athlete_daily_load
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), 'training'));

-- ── training_journals ──────────────────────────────────────────────
-- training_journals.user_id (not athlete_id) — see migration 023.
drop policy if exists "Parents read linked athlete journals" on public.training_journals;
create policy "Parents read linked athlete journals"
  on public.training_journals
  for select
  using (public.fn_guardian_can_read(user_id, auth.uid(), 'training'));

-- ═══════════════════════════════════════════════════════════════════
--  Part 5: Triangle policies on unified data layer (service-role-only
--  today → add athlete + guardian reads)
-- ═══════════════════════════════════════════════════════════════════

-- ── athlete_daily_vitals ───────────────────────────────────────────
drop policy if exists "Athletes read own vitals" on public.athlete_daily_vitals;
create policy "Athletes read own vitals"
  on public.athlete_daily_vitals
  for select
  using (athlete_id = auth.uid());

drop policy if exists "Guardians read linked athlete vitals" on public.athlete_daily_vitals;
create policy "Guardians read linked athlete vitals"
  on public.athlete_daily_vitals
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), 'wellbeing'));

-- ── athlete_benchmark_cache ────────────────────────────────────────
drop policy if exists "Athletes read own benchmarks" on public.athlete_benchmark_cache;
create policy "Athletes read own benchmarks"
  on public.athlete_benchmark_cache
  for select
  using (athlete_id = auth.uid());

drop policy if exists "Guardians read linked athlete benchmarks" on public.athlete_benchmark_cache;
create policy "Guardians read linked athlete benchmarks"
  on public.athlete_benchmark_cache
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), 'training'));

-- ── athlete_weekly_digest ──────────────────────────────────────────
drop policy if exists "Athletes read own weekly digest" on public.athlete_weekly_digest;
create policy "Athletes read own weekly digest"
  on public.athlete_weekly_digest
  for select
  using (athlete_id = auth.uid());

drop policy if exists "Guardians read linked athlete weekly digest" on public.athlete_weekly_digest;
create policy "Guardians read linked athlete weekly digest"
  on public.athlete_weekly_digest
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), null));

-- ── athlete_monthly_summary ────────────────────────────────────────
drop policy if exists "Athletes read own monthly summary" on public.athlete_monthly_summary;
create policy "Athletes read own monthly summary"
  on public.athlete_monthly_summary
  for select
  using (athlete_id = auth.uid());

drop policy if exists "Guardians read linked athlete monthly summary" on public.athlete_monthly_summary;
create policy "Guardians read linked athlete monthly summary"
  on public.athlete_monthly_summary
  for select
  using (public.fn_guardian_can_read(athlete_id, auth.uid(), null));

-- ═══════════════════════════════════════════════════════════════════
--  Part 6: Guardian read on athlete-only tables
-- ═══════════════════════════════════════════════════════════════════

-- ── calendar_events ────────────────────────────────────────────────
drop policy if exists "Guardians read linked athlete events calendar" on public.calendar_events;
create policy "Guardians read linked athlete events calendar"
  on public.calendar_events
  for select
  using (public.fn_guardian_can_read(user_id, auth.uid(), 'logistics'));

-- ── checkins ───────────────────────────────────────────────────────
-- Check-ins are wellness-domain (subjective readiness, sleep, mood).
drop policy if exists "Guardians read linked athlete checkins" on public.checkins;
create policy "Guardians read linked athlete checkins"
  on public.checkins
  for select
  using (public.fn_guardian_can_read(user_id, auth.uid(), 'wellbeing'));

-- ═══════════════════════════════════════════════════════════════════
--  Part 7: Realtime (athlete_daily_vitals / benchmark_cache / …)
-- ═══════════════════════════════════════════════════════════════════
-- athlete_snapshots is already in supabase_realtime (migration 012).
-- The unified-data-layer tables are not added here — backend workers
-- write them, and the mobile app reads via explicit refetch, not
-- Realtime. Adding later is a separate migration if the UX warrants.

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
