-- ═══════════════════════════════════════════════════════════════════
-- Migration 071 — Enterprise RBAC foundation (cms_tenants, org_memberships)
-- ═══════════════════════════════════════════════════════════════════
--
-- Ports the minimal subset of the multi-tenant B2B schema
-- (ai-service/migrations/041_multi_tenant_foundation.sql) that the
-- backend chain depends on:
--
--   - deletion_pipeline (072) RLS gates admin reads of deletion_tombstones
--     and deletion_purge_log through organization_memberships.role.
--   - drop_is_admin (075) rewrites six RLS policies to read admin rights
--     from organization_memberships instead of the retired users.is_admin.
--
-- Before this migration, those two files referenced a table that existed
-- only in ai-service's chain, so a clean `supabase db reset` failed with
-- `relation "public.organization_memberships" does not exist`. Porting
-- the authoritative definition here makes the backend chain
-- standalone-correct for fresh DBs and safe to co-apply with ai-service's
-- 041 against a shared DB (every DDL here mirrors 041 verbatim and uses
-- CREATE IF NOT EXISTS / DO duplicate_object guards).
--
-- Idempotent: all CREATE TABLE/INDEX/TRIGGER pair with IF NOT EXISTS or
-- DROP IF EXISTS; every CREATE POLICY is preceded by DROP POLICY IF
-- EXISTS. Safe to re-run and safe against ai-service 041 having already
-- shipped the same definitions to the DB.

-- ── 1. Enum types ─────────────────────────────────────────────────

do $$ begin
  create type tenant_tier as enum ('global', 'institution', 'group');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type org_role as enum (
    'super_admin', 'institutional_pd', 'coach', 'analyst', 'athlete'
  );
exception when duplicate_object then null;
end $$;

-- ── 2. cms_tenants ────────────────────────────────────────────────

create table if not exists public.cms_tenants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  tier                 tenant_tier not null default 'institution',
  parent_id            uuid references public.cms_tenants(id) on delete set null,
  config               jsonb not null default '{}',
  branding             jsonb not null default '{}',
  max_athletes         int default 500,
  max_coaches          int default 50,
  max_knowledge_chunks int default 200,
  is_active            boolean not null default true,
  subscription_tier    text default 'standard',
  contact_email        text,
  contact_name         text,
  country              text,
  timezone             text default 'UTC',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_cms_tenants_slug   on public.cms_tenants (slug);
create index if not exists idx_cms_tenants_parent on public.cms_tenants (parent_id) where parent_id is not null;
create index if not exists idx_cms_tenants_tier   on public.cms_tenants (tier);
create index if not exists idx_cms_tenants_active on public.cms_tenants (is_active) where is_active = true;

-- Root of the hierarchy. Fixed UUID so downstream code can reference it
-- as a known constant (lib/admin/enterpriseAuth.ts expects this).
insert into public.cms_tenants (id, name, slug, tier, parent_id, is_active, subscription_tier)
values (
  '00000000-0000-0000-0000-000000000001',
  'Tomo Global', 'tomo-global', 'global', null, true, 'enterprise'
) on conflict (slug) do nothing;

-- ── 3. organization_memberships ───────────────────────────────────

create table if not exists public.organization_memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.cms_tenants(id) on delete cascade,
  role        org_role not null default 'athlete',
  permissions jsonb not null default '{}',
  is_active   boolean not null default true,
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists idx_org_memberships_user   on public.organization_memberships (user_id);
create index if not exists idx_org_memberships_tenant on public.organization_memberships (tenant_id);
create index if not exists idx_org_memberships_role   on public.organization_memberships (role);
create index if not exists idx_org_memberships_active on public.organization_memberships (is_active) where is_active = true;

-- ── 4. RLS ────────────────────────────────────────────────────────

alter table public.cms_tenants              enable row level security;
alter table public.organization_memberships enable row level security;

drop policy if exists "Service role full access on cms_tenants" on public.cms_tenants;
create policy "Service role full access on cms_tenants"
  on public.cms_tenants for all
  using (auth.role() = 'service_role');

drop policy if exists "Authenticated users read their tenants" on public.cms_tenants;
create policy "Authenticated users read their tenants"
  on public.cms_tenants for select
  using (
    auth.role() = 'authenticated' and (
      tier = 'global'
      or id in (
        select tenant_id from public.organization_memberships
        where user_id = auth.uid() and is_active = true
      )
    )
  );

drop policy if exists "Service role full access on org_memberships" on public.organization_memberships;
create policy "Service role full access on org_memberships"
  on public.organization_memberships for all
  using (auth.role() = 'service_role');

drop policy if exists "Users read own memberships" on public.organization_memberships;
create policy "Users read own memberships"
  on public.organization_memberships for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists "PDs and admins read their org memberships" on public.organization_memberships;
create policy "PDs and admins read their org memberships"
  on public.organization_memberships for select
  using (
    auth.role() = 'authenticated' and
    tenant_id in (
      select tenant_id from public.organization_memberships
      where user_id = auth.uid()
        and role in ('super_admin', 'institutional_pd')
        and is_active = true
    )
  );

-- ── 5. updated_at triggers ────────────────────────────────────────
-- Shared helper; CREATE OR REPLACE is safe if ai-service 041 already
-- installed it against the same DB.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_cms_tenants_updated_at on public.cms_tenants;
create trigger update_cms_tenants_updated_at
  before update on public.cms_tenants
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_org_memberships_updated_at on public.organization_memberships;
create trigger update_org_memberships_updated_at
  before update on public.organization_memberships
  for each row execute function public.update_updated_at_column();

comment on table public.cms_tenants is
  'Tenant hierarchy (global > institution > group) for B2B multi-tenant RBAC. Mirror of ai-service/migrations/041; identical DDL so either chain can apply first.';
comment on table public.organization_memberships is
  'User-to-tenant role assignments. Admin RLS gates in backend migrations 072 and 075 read from this table.';
