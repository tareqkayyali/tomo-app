-- Migration 060: DOB, Consent, Legal Acceptance, Onboarding State
--
-- Phase 1 of the registration/onboarding overhaul. Establishes the
-- compliance columns required for EU / UK / US launch.
--
-- Design principles:
--   1. DOB is the source of truth. `age` (int) stays for backward
--      compatibility but is derived from DOB going forward.
--   2. Age-band is derived from DOB via get_age_band() so it can never
--      drift. Canonical bands per project memory: U13 / U15 / U17 / U19
--      / U21 / SEN / VET.
--   3. Under-13 is hard-blocked at application layer (register route).
--      The DB still stores DOB only when provided — no PII retained if
--      the age gate rejects the signup.
--   4. Legal acceptance is versioned. Bumping privacy_version or
--      tos_version triggers a forced re-acceptance modal on next app
--      open.
--   5. consent_status gates sensitive writes. 'active' = normal,
--      'awaiting_parent' = EU/UK 13-15 child before parent consents,
--      'revoked' = parent revoked; enforced in migration 062.
--
-- Idempotent: every column and function uses IF NOT EXISTS / OR REPLACE.

-- ── DOB + demographics ─────────────────────────────────────────────
alter table public.users
  add column if not exists date_of_birth date,
  add column if not exists date_of_birth_set_at timestamptz;

comment on column public.users.date_of_birth is
  'Canonical DOB. Source of truth for age + age-band. Collected at the age gate before account creation. Month + year precision is acceptable (stored as YYYY-MM-01).';

-- ── Legal acceptance (versioned) ───────────────────────────────────
alter table public.users
  add column if not exists tos_accepted_at timestamptz,
  add column if not exists tos_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_version text;

comment on column public.users.tos_version is
  'Version string of the Terms of Service the user accepted. Must match the current served version at backend/public/legal/terms.html; mismatch forces re-acceptance.';

comment on column public.users.privacy_version is
  'Version string of the Privacy Policy the user accepted. Must match the current served version at backend/public/legal/privacy.html; mismatch forces re-acceptance.';

-- ── Parental consent wiring ────────────────────────────────────────
alter table public.users
  add column if not exists consent_status text not null default 'active'
    check (consent_status in ('active', 'awaiting_parent', 'revoked')),
  add column if not exists consent_given_at timestamptz,
  add column if not exists consent_revoked_at timestamptz;

comment on column public.users.consent_status is
  'Minor consent state. ''active'' for adults or consented minors. ''awaiting_parent'' blocks sensitive writes (see migration 062). ''revoked'' when parent withdraws consent via parent portal.';

-- ── Analytics opt-in (privacy-by-default per UK AADC) ──────────────
alter table public.users
  add column if not exists analytics_opt_in boolean not null default false,
  add column if not exists analytics_opt_in_at timestamptz;

comment on column public.users.analytics_opt_in is
  'Explicit opt-in for Mixpanel / product analytics. Default false (privacy-by-default for minors). Toggled on the one-screen opt-in prompt post-signup and in Settings.';

-- ── Onboarding state (per-step persistence) ────────────────────────
alter table public.users
  add column if not exists onboarding_state jsonb;

comment on column public.users.onboarding_state is
  'Partial onboarding answers written after every step so the wizard resumes on crash. Shape: { step: string, answers: {...} }. Cleared when onboarding_complete flips true.';

-- ── Region (for GDPR-K branching) ──────────────────────────────────
alter table public.users
  add column if not exists region_code text;

comment on column public.users.region_code is
  'ISO 3166-1 alpha-2 country code resolved at age-gate time via Supabase Edge Function geo-IP. Used to branch EU/UK 13-15 into parental consent flow. Trusted server value; never set from client.';

-- ── Backfill DOB for existing users ────────────────────────────────
-- Per user decision: existing accounts get DOB derived as Jan 1 of
-- (current_year - age). Preserves age-band bucketing; accurate enough
-- for all downstream features that only read age_band.
update public.users
set
  date_of_birth = make_date(extract(year from now())::int - age, 1, 1),
  date_of_birth_set_at = now()
where age is not null
  and date_of_birth is null;

-- ── Age-band derivation function ───────────────────────────────────
-- Canonical bands per MEMORY.md / contextBuilder.ts. Callers should
-- always use this function rather than bucketing age manually.
create or replace function public.get_age_band(dob date)
returns text
language sql
stable
as $$
  select case
    when dob is null then 'unknown'
    else (
      with age_years as (
        select extract(year from age(current_date, dob))::int as y
      )
      select case
        when y < 13 then 'U13'
        when y < 15 then 'U15'
        when y < 17 then 'U17'
        when y < 19 then 'U19'
        when y < 21 then 'U21'
        when y < 30 then 'SEN'
        else 'VET'
      end
      from age_years
    )
  end;
$$;

comment on function public.get_age_band(date) is
  'Canonical age-band derivation. Stable within a day. Returns U13/U15/U17/U19/U21/SEN/VET/unknown. Use everywhere instead of ad-hoc age bucketing.';

-- ── Current age helper (server-only convenience) ───────────────────
create or replace function public.get_current_age(dob date)
returns int
language sql
stable
as $$
  select case
    when dob is null then null
    else extract(year from age(current_date, dob))::int
  end;
$$;

comment on function public.get_current_age(date) is
  'Returns full-years age from DOB, or null if DOB unset. Derived on read so it stays fresh across birthdays without a job.';

-- ── Index to accelerate age-band cohort queries ────────────────────
create index if not exists idx_users_date_of_birth on public.users (date_of_birth)
  where date_of_birth is not null;

create index if not exists idx_users_consent_status on public.users (consent_status)
  where consent_status <> 'active';
