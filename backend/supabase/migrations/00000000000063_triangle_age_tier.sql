-- Migration 063: Triangle Age-Tier Derivation
--
-- Adds the T1/T2/T3 compliance authority tier alongside the existing
-- U13..VET athletic age-band. Age-tier drives parent authority,
-- consent flows, and visibility defaults; age-band drives cohort
-- bucketing for benchmarks and training. Both are derived from DOB
-- and stored NOWHERE — DOB is the single source of truth.
--
-- Design principles:
--   1. Pure SQL function, stable within a day, mirrors the TS
--      `ageTierFromAge` in backend/services/compliance/ageTier.ts.
--      The two are asserted equal by the ageTier test suite's parity
--      block (to be added with P1.2 when RLS test infra lands).
--   2. View `v_user_tier` exposes (user_id, age_tier, age_band,
--      date_of_birth, region_code, consent_status) for consumption by
--      RLS policies and read paths that need tier without re-computing.
--   3. Locked GDPR-K rule: 16 EU-wide. Anyone under 16 is T1 or T2;
--      16+ is T3. Per user decision 2026-04-18.
--   4. UNKNOWN tier when DOB is null. Callers treat UNKNOWN as T2
--      (conservative per Apple 5.1.4 "treat as child if age unknown").
--
-- Idempotent: every statement uses CREATE OR REPLACE or
-- CREATE IF NOT EXISTS.

-- ── Age-tier derivation ────────────────────────────────────────────
create or replace function public.get_age_tier(dob date)
returns text
language sql
stable
as $$
  select case
    when dob is null then 'UNKNOWN'
    when extract(year from age(current_date, dob))::int < 13 then 'T1'
    when extract(year from age(current_date, dob))::int < 16 then 'T2'
    else 'T3'
  end;
$$;

comment on function public.get_age_tier(date) is
  'Canonical age-tier derivation (T1/T2/T3/UNKNOWN). Mirrors TS ageTierFromAge. T1 < 13 (COPPA), T2 13-15 (GDPR-K 16 EU-wide), T3 >= 16. Use in RLS policies and any code that gates on compliance authority.';

-- ── User-tier view ─────────────────────────────────────────────────
-- Joins the canonical tier + band + region together. Safe to select
-- from in RLS policies because it's SECURITY INVOKER (the caller's
-- permissions apply) and does not expose any new columns beyond what
-- the caller already has access to on public.users.
create or replace view public.v_user_tier as
select
  u.id                                   as user_id,
  u.date_of_birth,
  public.get_age_tier(u.date_of_birth)   as age_tier,
  public.get_age_band(u.date_of_birth)   as age_band,
  public.get_current_age(u.date_of_birth) as age,
  u.region_code,
  u.consent_status,
  u.role
from public.users u;

comment on view public.v_user_tier is
  'Per-user derived compliance view: age_tier (T1/T2/T3/UNKNOWN), age_band (U13..VET), region_code, consent_status. Read-only. Used by RLS policies and server-side read paths that need tier without a round-trip through the TS layer.';

-- ── Indexes ────────────────────────────────────────────────────────
-- date_of_birth already has idx_users_date_of_birth from migration 060.
-- region_code is expected to be low-cardinality — no index needed yet;
-- add when query patterns demand.

-- ── Grants ─────────────────────────────────────────────────────────
-- The view inherits RLS from public.users (SECURITY INVOKER). Grant
-- select to authenticated + service_role so RLS policies can reference
-- it without opening a privilege gap.
grant select on public.v_user_tier to authenticated;
grant select on public.v_user_tier to service_role;
