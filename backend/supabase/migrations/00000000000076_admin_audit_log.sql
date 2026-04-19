-- ═══════════════════════════════════════════════════════════════════
-- Migration 76 — admin_audit_log
-- ═══════════════════════════════════════════════════════════════════
-- Append-only trail of every CMS mutation performed by an admin user.
-- Written by backend/lib/admin/audit.ts from each admin service mutation;
-- viewed from /admin/audit.
--
-- Idempotent per the repo rule — every CREATE/CREATE POLICY/CREATE INDEX
-- uses IF NOT EXISTS or DROP + CREATE. Safe to re-run.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Actor (the CMS admin who performed the action).
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_email text,
  -- Snapshot of the primary role at time of action — roles can change
  -- after the fact, so we freeze what was in effect when the write ran.
  actor_role text not null,
  -- What happened. Common verbs: create, update, delete, activate,
  -- deactivate, role_change, impersonate_start, impersonate_end,
  -- bulk_import, config_change.
  action text not null,
  -- Resource taxonomy. Examples:
  --   "training_program", "knowledge_chunk", "drill", "mastery_config",
  --   "organization_membership", "feature_flag".
  resource_type text not null,
  -- UUID or natural identifier. Text because some resources use slugs.
  resource_id text,
  -- Tenant context for multi-org scoping of the audit view.
  tenant_id uuid references public.cms_tenants(id) on delete set null,
  -- Arbitrary context. For updates, the recommended shape is
  -- { before: {...}, after: {...} } so reviewers can diff.
  metadata jsonb not null default '{}'::jsonb,
  -- Network trail. Captured best-effort from the request headers.
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Append-only trail of every CMS mutation. Writers: services/admin/*. Viewer: /admin/audit. Retention: indefinite (no auto-prune).';

-- Indexes for the most common query shapes: by actor, by resource, by time.
create index if not exists idx_admin_audit_actor
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists idx_admin_audit_resource
  on public.admin_audit_log (resource_type, resource_id);
create index if not exists idx_admin_audit_time
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_tenant
  on public.admin_audit_log (tenant_id, created_at desc)
  where tenant_id is not null;

alter table public.admin_audit_log enable row level security;

-- Read: super_admin + institutional_pd (service role always bypasses RLS
-- for the write path, so no INSERT policy is required).
drop policy if exists admin_audit_log_admin_select on public.admin_audit_log;
create policy admin_audit_log_admin_select
  on public.admin_audit_log for select
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('super_admin','institutional_pd')
    )
  );

-- Nobody edits or deletes audit rows — the table is append-only.
-- No update/delete policies = every non-service-role write is denied by RLS.
