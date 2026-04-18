-- Migration 069: Triangle Input Registry
--
-- P2.3 of the Triangle coordination layer. The structural piece that
-- makes Tomo a coordination platform instead of three apps sharing a
-- login. Every coach/parent input (standing instruction, constraint,
-- preference, observation, goal) becomes a structured, weighted,
-- domain-tagged record that the AI prompt builder can retrieve and
-- inject between Dual-Load and RAG in the locked system-prompt order
-- (P2.4 consumes this).
--
-- Patent-worthy IP: the (tier × domain × role) weight matrix + recency
-- decay + injection ordering is what transforms triangle member notes
-- into a coordinated coaching signal without letting any single adult
-- override safety gates.
--
-- Design principles:
--   1. Input-level weighting — base weight comes from triangle_input_
--      _weights (tier × domain × author_role). Recency decay applied
--      at retrieval time (pure function in services/triangle/weights.ts).
--   2. Event-scoped vs standing — event_scope_id=null is a standing
--      instruction; event-scoped inputs win over standing at retrieval
--      when the caller passes the event id.
--   3. Retraction is soft — retracted_at non-null hides the input from
--      retrieval but preserves it for audit.
--   4. Moderation-gated — same moderate() wrapper as event_annotations.
--      Only moderation_state IN ('cleared','pending') feed the AI prompt.
--   5. Safety is never weighted away — the safety domain defaults to
--      weight 1.0 for both roles across all tiers. Parent and coach
--      inputs in the safety domain inform the AI but the deterministic
--      PHV/ACWR filter still overrides.
--
-- Idempotent.

-- ═══════════════════════════════════════════════════════════════════
--  triangle_input_weights — tier × domain × author_role base weights
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.triangle_input_weights (
  age_tier text not null check (age_tier in ('T1','T2','T3','UNKNOWN')),
  domain text not null check (domain in (
    'training','academic','wellbeing','safety','logistics'
  )),
  author_role text not null check (author_role in ('coach','parent')),
  base_weight numeric(3,2) not null check (base_weight >= 0 and base_weight <= 1),
  requires_t3_preference boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (age_tier, domain, author_role)
);

comment on table public.triangle_input_weights is
  'Tier × domain × role base-weight matrix for Triangle Input Registry. Single source of truth for how much weight the AI prompt builder assigns to coach vs parent input by athlete age-tier and query domain. Updated via /admin/triangle-weights surface when performance-director review warrants. Seed values locked 2026-04-18.';

alter table public.triangle_input_weights enable row level security;

-- Service-role writes; anyone authenticated can read (the values are
-- not sensitive — they're the policy layer).
drop policy if exists "Anyone read triangle weights" on public.triangle_input_weights;
create policy "Anyone read triangle weights"
  on public.triangle_input_weights
  for select
  to authenticated
  using (true);

drop policy if exists "Admins manage triangle weights" on public.triangle_input_weights;
create policy "Admins manage triangle weights"
  on public.triangle_input_weights
  for all
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select on public.triangle_input_weights to authenticated;
grant all on public.triangle_input_weights to service_role;

-- Seed the policy matrix (locked 2026-04-18). Values must be reviewed
-- by athlete-performance-director + child-psych personas before any
-- material revision; changes are migrations, not UPDATEs.
insert into public.triangle_input_weights (age_tier, domain, author_role, base_weight, requires_t3_preference)
values
  -- T1 (<13): parent authority dominant, safety 1.0 both roles
  ('T1','training',  'coach',  0.90, false),
  ('T1','training',  'parent', 1.00, false),
  ('T1','academic', 'coach',   0.40, false),
  ('T1','academic', 'parent',  1.00, false),
  ('T1','wellbeing','coach',   0.70, false),
  ('T1','wellbeing','parent',  1.00, false),
  ('T1','safety',   'coach',   1.00, false),
  ('T1','safety',   'parent',  1.00, false),
  ('T1','logistics','coach',   0.70, false),
  ('T1','logistics','parent',  1.00, false),
  -- T2 (13-15): coach training parity, parent still heavy on academic/safety
  ('T2','training',  'coach',  1.00, false),
  ('T2','training',  'parent', 0.90, false),
  ('T2','academic', 'coach',   0.50, false),
  ('T2','academic', 'parent',  1.00, false),
  ('T2','wellbeing','coach',   0.80, false),
  ('T2','wellbeing','parent',  0.90, false),
  ('T2','safety',   'coach',   1.00, false),
  ('T2','safety',   'parent',  1.00, false),
  ('T2','logistics','coach',   0.80, false),
  ('T2','logistics','parent',  0.90, false),
  -- T3 (≥16): athlete preference gates parent; coach full weight
  ('T3','training',  'coach',  1.00, false),
  ('T3','training',  'parent', 0.50, true),
  ('T3','academic', 'coach',   0.40, false),
  ('T3','academic', 'parent',  0.70, true),
  ('T3','wellbeing','coach',   0.80, false),
  ('T3','wellbeing','parent',  0.60, true),
  ('T3','safety',   'coach',   1.00, false),
  ('T3','safety',   'parent',  1.00, false),  -- safety never opt-out
  ('T3','logistics','coach',   1.00, false),
  ('T3','logistics','parent',  0.60, true),
  -- UNKNOWN: treat as T2 conservative (Apple 5.1.4)
  ('UNKNOWN','training',  'coach',  1.00, false),
  ('UNKNOWN','training',  'parent', 0.90, false),
  ('UNKNOWN','academic', 'coach',   0.50, false),
  ('UNKNOWN','academic', 'parent',  1.00, false),
  ('UNKNOWN','wellbeing','coach',   0.80, false),
  ('UNKNOWN','wellbeing','parent',  0.90, false),
  ('UNKNOWN','safety',   'coach',   1.00, false),
  ('UNKNOWN','safety',   'parent',  1.00, false),
  ('UNKNOWN','logistics','coach',   0.80, false),
  ('UNKNOWN','logistics','parent',  0.90, false)
on conflict (age_tier, domain, author_role) do nothing;

-- ═══════════════════════════════════════════════════════════════════
--  triangle_inputs — the registry of weighted coach/parent inputs
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.triangle_inputs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('coach','parent')),
  domain text not null check (domain in (
    'training','academic','wellbeing','safety','logistics'
  )),
  input_type text not null check (input_type in (
    'standing_instruction','constraint','preference','observation','goal'
  )),
  body text not null check (length(trim(body)) > 0),
  event_scope_id uuid references public.calendar_events(id) on delete set null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  moderation_state text not null default 'pending' check (moderation_state in (
    'pending','cleared','hidden','removed'
  )),
  retracted_at timestamptz,
  retracted_reason text,
  created_at timestamptz not null default now()
);

comment on table public.triangle_inputs is
  'Triangle Input Registry. Coach/parent structured inputs that feed the AI prompt builder with weighted context. Retrieved by getTriangleInputs() and injected between Dual-Load and RAG per locked section order. Safety domain inputs inform but never override the deterministic PHV/ACWR filter.';

-- Indexes for the retrieval patterns
create index if not exists idx_triangle_inputs_athlete_created
  on public.triangle_inputs (athlete_id, created_at desc)
  where retracted_at is null and moderation_state in ('cleared','pending');

create index if not exists idx_triangle_inputs_scope_event
  on public.triangle_inputs (athlete_id, event_scope_id, created_at desc)
  where retracted_at is null and moderation_state in ('cleared','pending');

create index if not exists idx_triangle_inputs_domain_role
  on public.triangle_inputs (athlete_id, domain, author_role, created_at desc)
  where retracted_at is null and moderation_state in ('cleared','pending');

create index if not exists idx_triangle_inputs_author
  on public.triangle_inputs (author_id, created_at desc);

-- RLS
alter table public.triangle_inputs enable row level security;

-- Athletes read inputs about themselves (clearedpending only; hidden
-- is admin-only).
drop policy if exists "Athletes read own triangle inputs" on public.triangle_inputs;
create policy "Athletes read own triangle inputs"
  on public.triangle_inputs
  for select
  using (
    athlete_id = auth.uid()
    and retracted_at is null
    and moderation_state in ('cleared','pending')
  );

-- Authors always read own inputs regardless of moderation / retraction
-- (so they can see what they've contributed + see moderation state).
drop policy if exists "Authors read own triangle inputs" on public.triangle_inputs;
create policy "Authors read own triangle inputs"
  on public.triangle_inputs
  for select
  using (author_id = auth.uid());

-- Guardians read inputs on linked athletes per fn_guardian_can_read.
drop policy if exists "Guardians read linked athlete triangle inputs" on public.triangle_inputs;
create policy "Guardians read linked athlete triangle inputs"
  on public.triangle_inputs
  for select
  using (
    retracted_at is null
    and moderation_state in ('cleared','pending')
    and public.fn_guardian_can_read(athlete_id, auth.uid(), domain)
  );

-- Authors insert own inputs; must match an accepted relationship at
-- app layer. moderation_state=pending at insert time (application sets
-- to cleared/hidden after moderate() result).
drop policy if exists "Authors insert own triangle inputs" on public.triangle_inputs;
create policy "Authors insert own triangle inputs"
  on public.triangle_inputs
  for insert
  with check (author_id = auth.uid());

-- Authors update own inputs (to edit body, retract, etc.).
drop policy if exists "Authors update own triangle inputs" on public.triangle_inputs;
create policy "Authors update own triangle inputs"
  on public.triangle_inputs
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update on public.triangle_inputs to authenticated;
grant all on public.triangle_inputs to service_role;

-- Realtime — inputs update the prompt-injection context live when the
-- agent subscribes.
alter publication supabase_realtime add table public.triangle_inputs;

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
