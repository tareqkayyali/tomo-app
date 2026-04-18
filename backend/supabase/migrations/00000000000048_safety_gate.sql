-- Migration 048: AI Safety Gate
-- Singleton config row for the AI Chat safety gate. Controls when the
-- AI refuses / swaps training requests to protect athlete wellbeing.
--
-- Design principles (per product spec):
--   1. CMS-managed — every field surfaces in /admin/safety-gate as a
--      typed form control. ZERO JSON blob editing in the UI.
--   2. Typed primitives — bool, int, text[]. The API route validates
--      with Zod; the admin UI renders toggles + number inputs + chip
--      editors. Adding a new knob == one column + one form row.
--   3. Kill-switchable — the `enabled` master toggle short-circuits all
--      checks so ops can disable instantly on a regression.
--   4. Auditable — updated_at/updated_by populated on every write.
--   5. Single source of truth — ai-service reads this row via a 60s
--      cache. No env vars, no hardcoded thresholds, no drift.

-- ── Prerequisite: users.is_admin ────────────────────────────────────
-- Added here (idempotent) so the admin RLS policies below can reference
-- it. In production this column was added out-of-band; `IF NOT EXISTS`
-- makes this a safe no-op there. On fresh local resets it closes the
-- gap that previously caused migration 048 to fail.
-- Also consumed by migration 049 and by lib/admin/apiAuth.ts.
alter table public.users add column if not exists is_admin boolean not null default false;

create table if not exists public.safety_gate_config (
  id uuid primary key default gen_random_uuid(),
  -- Master kill-switch. When false the gate is inert (allow=true always).
  enabled boolean not null default true,

  -- ── Readiness-based blocks ──────────────────────────────────────────
  -- Block HARD-intensity training requests when readiness is RED.
  -- This is the most important safety rule.
  block_hard_on_red boolean not null default true,
  -- Block MODERATE too on RED (conservative orgs only).
  block_moderate_on_red boolean not null default false,
  -- Block HARD on YELLOW. Off by default -- YELLOW is "proceed with care".
  block_hard_on_yellow boolean not null default false,

  -- ── Load-based blocks ───────────────────────────────────────────────
  -- Minimum rest hours after a HARD session before another HARD can be
  -- scheduled. 0 disables the rule.
  min_rest_hours_after_hard int not null default 24
    check (min_rest_hours_after_hard >= 0 and min_rest_hours_after_hard <= 168),
  -- Hard cap on HARD sessions per 7-day rolling window.
  max_hard_per_week int not null default 3
    check (max_hard_per_week >= 0 and max_hard_per_week <= 14),

  -- ── Pain / injury keyword detection ─────────────────────────────────
  -- If the user's message contains any of these keywords, the gate
  -- auto-routes to recovery + recommends seeing a physio. Case-insensitive
  -- substring match. Admin edits via a chip editor (no array typing).
  pain_keywords text[] not null default array[
    'pain', 'hurt', 'injured', 'injury', 'sore', 'tweaked', 'pulled',
    'strain', 'sprain', 'ache', 'stiff', 'swollen'
  ]::text[],

  -- ── Response phrasing (admin-controlled tone) ───────────────────────
  -- The gate surfaces the reason to the athlete using this template.
  -- Plain text only, no placeholders required. Keeps the voice consistent
  -- with the rest of Tomo's coaching tone.
  red_block_message text not null default
    'Your readiness is in the red today — your body needs recovery, not intensity. Let''s swap this for a light mobility + recovery block instead.',
  pain_block_message text not null default
    'Heard you mention pain — I''m going to hold off on the training request. Talk to your physio or coach first, and we''ll pick it back up when you''re cleared.',
  load_block_message text not null default
    'You''ve already banked the hard work this week. Another HARD session would push you into overload territory — let''s keep today light or moderate.',

  -- ── Audit ───────────────────────────────────────────────────────────
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Partial unique index enforcing a singleton row: only one config ever.
-- Any future multi-tenant split would add a tenant_id column and replace
-- this with a unique(tenant_id) constraint.
create unique index if not exists safety_gate_config_singleton
  on public.safety_gate_config ((true));

-- Updated_at trigger
create or replace function public.set_safety_gate_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists safety_gate_config_updated_at on public.safety_gate_config;
create trigger safety_gate_config_updated_at
  before update on public.safety_gate_config
  for each row execute function public.set_safety_gate_config_updated_at();

-- RLS: admin-only read/write. Non-admin API calls go through the
-- ai-service which uses the service role client and bypasses RLS.
alter table public.safety_gate_config enable row level security;

drop policy if exists safety_gate_config_admin_read on public.safety_gate_config;
create policy safety_gate_config_admin_read
  on public.safety_gate_config for select
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.is_admin = true
    )
  );

drop policy if exists safety_gate_config_admin_write on public.safety_gate_config;
create policy safety_gate_config_admin_write
  on public.safety_gate_config for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.is_admin = true
    )
  );

-- Seed the singleton row with defaults so the UI always has something
-- to render on first visit.
insert into public.safety_gate_config (enabled)
select true
where not exists (select 1 from public.safety_gate_config);

comment on table public.safety_gate_config is
  'AI Chat safety gate configuration. Singleton row, admin-managed via /admin/safety-gate. Evaluated per-request in ai-service safety_gate.py.';
