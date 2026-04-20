-- ═══════════════════════════════════════════════════════════════════
-- Migration 78 — pd_protocol_generations
-- ═══════════════════════════════════════════════════════════════════
-- Audit trail for the plain-text prompt layer of the PD Protocol Builder.
-- Each row records one AI-generated protocol draft produced from a PD's
-- natural-language prompt. The outcome column tracks the draft through its
-- lifecycle (pending → saved / edited_then_saved / discarded / failed) so
-- we can attribute cost, measure PD-edit delta, and support compliance.
--
-- Writers: services/admin/pdProtocolGenerator.ts (inserts, outcome='pending')
--          app/api/v1/admin/enterprise/protocols/builder POST (updates to
--          outcome='saved'|'edited_then_saved' + saved_protocol_id)
--          app/api/v1/admin/enterprise/protocols/generations/[id]/discard POST
-- Viewer:  /admin/enterprise/protocols/generations
--
-- Idempotent per the repo rule — every CREATE uses IF NOT EXISTS and
-- every CREATE POLICY is preceded by DROP POLICY IF EXISTS. Safe to re-run.

create table if not exists public.pd_protocol_generations (
  generation_id      uuid primary key default gen_random_uuid(),

  -- Actor — the PD who ran the prompt.
  created_by         uuid not null references auth.users(id) on delete set null,
  created_by_email   text,

  -- Tenant context. Nullable because a super_admin may generate a global
  -- protocol with no institution_id scope.
  tenant_id          uuid references public.cms_tenants(id) on delete set null,

  -- The PD's input: plain-text prompt + optional scope hints fed into the
  -- generator (sport, position, phv_stage, age_band).
  prompt             text not null,
  scope_hints        jsonb not null default '{}'::jsonb,

  -- The AI output: flat protocol JSON matching pd_protocols columns.
  draft_protocol     jsonb not null,

  -- RAG chunks used as grounding context. Shape: [{chunk_id, title, evidence_grade}].
  rag_chunks_used    jsonb not null default '[]'::jsonb,

  -- Telemetry — mirrors api_usage_log for per-generation attribution.
  model              text not null,
  input_tokens       int  not null default 0,
  output_tokens      int  not null default 0,
  cache_read_tokens  int  not null default 0,
  cache_write_tokens int  not null default 0,
  cost_usd           numeric(10, 6) not null default 0,
  latency_ms         int,

  -- Lifecycle:
  --   pending             — draft returned to UI, PD has not yet acted
  --   saved               — PD saved the draft byte-for-byte via the builder endpoint
  --   edited_then_saved   — PD modified the draft before saving
  --   discarded           — PD rejected the draft
  --   failed              — Zod validation rejected Claude's output
  outcome            text not null default 'pending'
    check (outcome in ('pending','saved','edited_then_saved','discarded','failed')),

  -- Link to the resulting pd_protocols row, populated when outcome transitions
  -- to saved or edited_then_saved.
  saved_protocol_id  uuid references public.pd_protocols(protocol_id) on delete set null,

  -- Populated only when outcome='failed' — captures the Zod issues so the PD
  -- can see why Claude's output was rejected.
  validation_errors  jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.pd_protocol_generations is
  'Audit trail for the prompt-driven PD Protocol Builder. One row per Claude generation. Lifecycle: pending -> (saved|edited_then_saved|discarded|failed). Writers: services/admin/pdProtocolGenerator.ts + builder POST + discard endpoint. Viewer: /admin/enterprise/protocols/generations.';

-- ─── Indexes ────────────────────────────────────────────────────────
create index if not exists idx_ppg_created_by
  on public.pd_protocol_generations (created_by, created_at desc);

create index if not exists idx_ppg_tenant
  on public.pd_protocol_generations (tenant_id, created_at desc)
  where tenant_id is not null;

create index if not exists idx_ppg_outcome
  on public.pd_protocol_generations (outcome, created_at desc);

create index if not exists idx_ppg_saved_protocol
  on public.pd_protocol_generations (saved_protocol_id)
  where saved_protocol_id is not null;

create index if not exists idx_ppg_created_at
  on public.pd_protocol_generations (created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.pd_protocol_generations enable row level security;

-- SELECT: super_admin + institutional_pd. Tenant-scoped for institutional_pd
-- (their generations or generations on tenants they are members of).
drop policy if exists ppg_admin_select on public.pd_protocol_generations;
create policy ppg_admin_select
  on public.pd_protocol_generations for select
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and (
          om.role = 'super_admin'
          or (
            om.role = 'institutional_pd'
            and (
              pd_protocol_generations.tenant_id is null
              or om.tenant_id = pd_protocol_generations.tenant_id
              or pd_protocol_generations.created_by = auth.uid()
            )
          )
        )
    )
  );

-- INSERT / UPDATE are performed via the service role (supabaseAdmin) which
-- bypasses RLS, matching the pattern used by pd_protocol_audit and
-- admin_audit_log. No policies required for writes.

-- ─── updated_at trigger ─────────────────────────────────────────────
create or replace function public.set_pd_protocol_generations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ppg_set_updated_at on public.pd_protocol_generations;
create trigger trg_ppg_set_updated_at
  before update on public.pd_protocol_generations
  for each row
  execute function public.set_pd_protocol_generations_updated_at();
