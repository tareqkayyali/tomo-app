-- ═══════════════════════════════════════════════════════════════════
-- Migration 67 — Retire users.is_admin; switch RLS to enterprise RBAC.
-- ═══════════════════════════════════════════════════════════════════
-- The backend's TypeScript admin auth has been migrated from the
-- users.is_admin boolean to the organization_memberships / cms_tenants
-- RBAC model (see lib/admin/enterpriseAuth.ts). Six existing RLS
-- policies still check users.is_admin and must be rewritten before the
-- column can be dropped. This migration:
--
--   1. Replaces the 6 RLS policies to require
--        organization_memberships.role <= 'institutional_pd'
--      (i.e. super_admin or institutional_pd) on an active membership.
--   2. Drops users.is_admin.
--
-- Fully idempotent: every policy is DROP POLICY IF EXISTS then CREATE
-- POLICY, and the column drop uses IF EXISTS. Safe to re-run.

-- ── Helper: admin check via organization_memberships ──────────────
-- Inline expression used by every policy below. institutional_pd (tier
-- 1) and super_admin (tier 0) in ROLE_HIERARCHY both grant admin write.
--
--   exists (
--     select 1 from public.organization_memberships om
--     where om.user_id = auth.uid()
--       and om.is_active = true
--       and om.role in ('super_admin','institutional_pd')
--   )

-- ── safety_gate_config (from migration 48) ────────────────────────
drop policy if exists safety_gate_config_admin_read on public.safety_gate_config;
create policy safety_gate_config_admin_read
  on public.safety_gate_config for select
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('super_admin','institutional_pd')
    )
  );

drop policy if exists safety_gate_config_admin_write on public.safety_gate_config;
create policy safety_gate_config_admin_write
  on public.safety_gate_config for all
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('super_admin','institutional_pd')
    )
  );

-- ── training_programs (from migration 49) ─────────────────────────
drop policy if exists training_programs_admin_write on public.training_programs;
create policy training_programs_admin_write
  on public.training_programs for all
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('super_admin','institutional_pd')
    )
  );

drop policy if exists position_training_matrix_admin_write on public.position_training_matrix;
create policy position_training_matrix_admin_write
  on public.position_training_matrix for all
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('super_admin','institutional_pd')
    )
  );

-- ── deletion_pipeline (from migration 64, may not be applied yet) ─
-- Wrapped so this migration is safe to run on envs where the deletion
-- pipeline hasn't shipped. When migration 64 lands, it should define
-- its policies using the enterprise-RBAC pattern from the start.
do $$
begin
  if to_regclass('public.deletion_tombstones') is not null then
    execute 'drop policy if exists "deletion_tombstones_admin_select" on public.deletion_tombstones';
    execute $pol$
      create policy "deletion_tombstones_admin_select"
        on public.deletion_tombstones for select
        using (
          exists (
            select 1 from public.organization_memberships om
            where om.user_id = auth.uid()
              and om.is_active = true
              and om.role in ('super_admin','institutional_pd')
          )
        )
    $pol$;
  end if;

  if to_regclass('public.deletion_purge_log') is not null then
    execute 'drop policy if exists "deletion_purge_log_admin_select" on public.deletion_purge_log';
    execute $pol$
      create policy "deletion_purge_log_admin_select"
        on public.deletion_purge_log for select
        using (
          exists (
            select 1 from public.organization_memberships om
            where om.user_id = auth.uid()
              and om.is_active = true
              and om.role in ('super_admin','institutional_pd')
          )
        )
    $pol$;
  end if;
end $$;

-- ── Drop the column ───────────────────────────────────────────────
-- Safe after every reader is replaced. The TypeScript code has already
-- been switched in this same commit (see lib/admin/*).
alter table public.users drop column if exists is_admin;

-- Post-migration checklist for the operator:
--   1. Run in Supabase SQL Editor (this migration is idempotent).
--   2. Regenerate types:
--        npx supabase gen types typescript --local > types/database.ts
--   3. Ensure at least one row exists in organization_memberships for
--      every user who previously had is_admin = true, with
--      role = 'super_admin' on the global tenant. Without this, that
--      user will lose CMS access.
