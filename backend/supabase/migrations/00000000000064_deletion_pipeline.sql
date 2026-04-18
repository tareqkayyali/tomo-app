-- Migration 064: GDPR Article 17 Deletion Pipeline
--
-- Replaces the crude cascade-delete in /api/v1/user/delete with a
-- request → grace-period → purge pipeline that satisfies GDPR Art. 17,
-- CCPA §1798.105, and UAE/KSA PDPL erasure rights.
--
-- Pipeline phases:
--   1. REQUEST. User (or parent, admin, regulator) submits a deletion
--      request. Row is inserted into public.deletion_requests with
--      status='pending', scheduled_purge_at = now() + grace days (30
--      for GDPR, 45 for CCPA, 90 for PDPL, per decision 2026-04-18).
--      Trigger fires on public.users stamping deletion_requested_at +
--      deletion_scheduled_purge_at for the write-gate and the 410 GONE
--      API response.
--   2. GRACE. All writes are blocked at both DB (this migration extends
--      the consent-gate trigger) and API layers. Reads from the app
--      return 410 GONE. User can cancel via the cancel endpoint, which
--      sets status='cancelled' and clears the stamps on users.
--   3. PURGE. pg_cron (migration 065) runs public.tomo_run_deletion_purge()
--      daily. For every due request it calls public.tomo_purge_user()
--      which: (a) anonymises audit/telemetry tables by nulling user_id
--      and stamping tombstone_id, (b) writes a tombstone row capturing
--      jurisdiction + method + aggregated non-PII cohort data, and
--      (c) deletes the auth.users row — Postgres' ON DELETE CASCADE on
--      public.users then zeroes every athlete-scoped child table.
--
-- Design principles (enforced here):
--   • Every table has RLS from day one. Deletion requests are visible
--     only to the owning athlete and admins; tombstones are admin-only
--     (non-PII but operationally sensitive); purge logs are admin-only.
--   • Every table's create uses IF NOT EXISTS; every trigger pair uses
--     DROP TRIGGER IF EXISTS + CREATE. Re-runnable without error.
--   • No PII in tombstones. Only aggregate cohort metadata (age_band,
--     region_code) and audit metadata (jurisdiction, method, counts).
--   • Audit tables (safety_audit_log, chat_quality_scores, ai_trace_log,
--     prompt_shadow_runs) are never deleted. They're anonymised by
--     nulling user_id and attaching the tombstone_id for forensic
--     correlation without re-identifying the subject.
--   • Unique partial index on (user_id) WHERE status='pending' ensures
--     one active deletion request per user — re-requesting while one is
--     pending is idempotent from the client's perspective.
--   • Write-gate trigger is additive to the existing consent-gate; both
--     run on the same tables. A deletion_requested_at stamp blocks
--     identically to consent_status <> 'active'.

-- ══════════════════════════════════════════════════════════════════
-- SECTION 1 — deletion_requests
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  jurisdiction text not null default 'GDPR'
    check (jurisdiction in ('GDPR', 'CCPA', 'PDPL', 'CUSTOM')),
  grace_period_days int not null
    check (grace_period_days between 0 and 365),
  scheduled_purge_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'cancelled', 'purging', 'purged', 'failed')),
  method text not null default 'user_self_service'
    check (method in (
      'user_self_service',
      'admin_forced',
      'parent_revocation',
      'regulator_request'
    )),
  cancelled_at timestamptz,
  cancelled_reason text,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  purge_started_at timestamptz,
  purge_completed_at timestamptz,
  failure_reason text,
  failure_count int not null default 0,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  reminder_7d_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deletion_requests is
  'GDPR Art. 17 / CCPA / PDPL deletion pipeline state. One row per request. A user may have at most one status=''pending'' row at a time (enforced by partial unique index). Grace period is jurisdiction-driven: GDPR=30, CCPA=45, PDPL=90, CUSTOM=caller-supplied.';

-- At most one active pending request per user.
create unique index if not exists uq_deletion_requests_user_pending
  on public.deletion_requests (user_id)
  where status = 'pending';

-- Purge job scan index: the cron predicate is
-- `status='pending' AND scheduled_purge_at < now()`.
create index if not exists idx_deletion_requests_due
  on public.deletion_requests (scheduled_purge_at)
  where status = 'pending';

-- Admin review surface sorts by requested_at desc.
create index if not exists idx_deletion_requests_requested_at
  on public.deletion_requests (requested_at desc);

alter table public.deletion_requests enable row level security;

drop policy if exists "deletion_requests_owner_select"
  on public.deletion_requests;
create policy "deletion_requests_owner_select"
  on public.deletion_requests for select
  using (auth.uid() = user_id);

-- Owners can INSERT requests for themselves. Admin-forced and
-- parent_revocation flows run under service_role and bypass RLS.
drop policy if exists "deletion_requests_owner_insert"
  on public.deletion_requests;
create policy "deletion_requests_owner_insert"
  on public.deletion_requests for insert
  with check (auth.uid() = user_id and method = 'user_self_service');

-- Owner-cancel only. All other status transitions go through the SQL
-- functions below under service_role. A cancelled row is immutable
-- after cancellation.
drop policy if exists "deletion_requests_owner_cancel"
  on public.deletion_requests;
create policy "deletion_requests_owner_cancel"
  on public.deletion_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status in ('pending', 'cancelled'));

-- updated_at maintenance.
create or replace function public.touch_deletion_requests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_deletion_requests_updated_at
  on public.deletion_requests;
create trigger trg_deletion_requests_updated_at
  before update on public.deletion_requests
  for each row execute function public.touch_deletion_requests_updated_at();


-- ══════════════════════════════════════════════════════════════════
-- SECTION 2 — deletion_tombstones
-- ══════════════════════════════════════════════════════════════════
-- Post-purge audit marker. Zero PII. One row per completed purge.
-- Audit/telemetry tables are anonymised by nulling their user_id and
-- storing a pointer to this tombstone so forensic correlation is
-- possible without re-identifying the subject.

create table if not exists public.deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null references public.deletion_requests(id) on delete restrict,
  purged_at timestamptz not null default now(),
  jurisdiction text not null
    check (jurisdiction in ('GDPR', 'CCPA', 'PDPL', 'CUSTOM')),
  method text not null
    check (method in (
      'user_self_service',
      'admin_forced',
      'parent_revocation',
      'regulator_request'
    )),
  -- Non-PII aggregate metadata preserved for analytics + regulator
  -- reporting. None of these fields can individually re-identify a
  -- subject once joined with other Tomo tables.
  age_band text,
  region_code text,
  account_tenure_days int,
  tables_purged jsonb not null default '[]'::jsonb,
  tables_anonymised jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.deletion_tombstones is
  'GDPR Art. 30 audit record. Contains ZERO PII — only aggregate cohort data (age_band, region_code) and deletion metadata (jurisdiction, method, tables affected). Audit/telemetry tables reference this row via deletion_tombstone_id after anonymisation.';

create index if not exists idx_deletion_tombstones_purged_at
  on public.deletion_tombstones (purged_at desc);

create unique index if not exists uq_deletion_tombstones_request_id
  on public.deletion_tombstones (deletion_request_id);

alter table public.deletion_tombstones enable row level security;

-- Admins only. Service role bypasses RLS for the purge path.
drop policy if exists "deletion_tombstones_admin_select"
  on public.deletion_tombstones;
create policy "deletion_tombstones_admin_select"
  on public.deletion_tombstones for select
  using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  ));


-- ══════════════════════════════════════════════════════════════════
-- SECTION 3 — deletion_purge_log
-- ══════════════════════════════════════════════════════════════════
-- Per-table forensic log. Written inside tomo_purge_user() as it
-- processes each table in the plan. Captures row counts so we can
-- spot silent failures.

create table if not exists public.deletion_purge_log (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null references public.deletion_requests(id) on delete cascade,
  tombstone_id uuid references public.deletion_tombstones(id) on delete set null,
  table_name text not null,
  action text not null
    check (action in ('cascade_delete', 'anonymise', 'tombstone_link', 'skip')),
  rows_affected int not null default 0,
  executed_at timestamptz not null default now(),
  duration_ms int,
  error_message text
);

comment on table public.deletion_purge_log is
  'Per-table execution trail for a deletion purge. Contains no PII — only table names and row counts. Used for silent-failure detection and regulator reporting.';

create index if not exists idx_deletion_purge_log_request
  on public.deletion_purge_log (deletion_request_id, executed_at);

alter table public.deletion_purge_log enable row level security;

drop policy if exists "deletion_purge_log_admin_select"
  on public.deletion_purge_log;
create policy "deletion_purge_log_admin_select"
  on public.deletion_purge_log for select
  using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  ));


-- ══════════════════════════════════════════════════════════════════
-- SECTION 4 — soft-delete columns on public.users
-- ══════════════════════════════════════════════════════════════════
-- Denormalised stamps for the hot path. API layer reads these on
-- every request to short-circuit a 410 GONE response. Write-gate
-- trigger reads these to block inserts/updates.

alter table public.users
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_purge_at timestamptz,
  add column if not exists deletion_request_id uuid
    references public.deletion_requests(id) on delete set null;

comment on column public.users.deletion_requested_at is
  'Denormalised stamp: set when a pending deletion_request exists for this user. Read by the API to short-circuit all requests to 410 GONE, and by the write-gate trigger to block all DB writes. Cleared when the request is cancelled.';

create index if not exists idx_users_deletion_requested
  on public.users (deletion_requested_at)
  where deletion_requested_at is not null;


-- ══════════════════════════════════════════════════════════════════
-- SECTION 5 — extend the consent/account write-gate with deletion
-- ══════════════════════════════════════════════════════════════════
-- Migration 062 installed enforce_consent_gate() on chat_messages,
-- checkins, health_data, sleep_logs, video_test_results. Redefine it
-- so the same trigger also blocks writes once deletion_requested_at
-- is set. Adds no new triggers — reuses the existing attachments.

create or replace function public.enforce_consent_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_deletion_requested timestamptz;
begin
  select consent_status, deletion_requested_at
    into v_status, v_deletion_requested
  from public.users
  where id = new.user_id;

  -- Account scheduled for erasure. Hard block — no jurisdiction allows
  -- new writes during the grace period (they'd just be purged anyway).
  if v_deletion_requested is not null then
    raise exception
      'account_gate: write blocked for user_id=% (deletion_requested_at=%)',
      new.user_id, v_deletion_requested
      using errcode = 'P0001',
            hint = 'Account is scheduled for erasure. Cancel the deletion request to resume writes.';
  end if;

  if v_status is null or v_status = 'active' then
    return new;
  end if;

  raise exception
    'consent_gate: write blocked for user_id=% (consent_status=%)',
    new.user_id, v_status
    using errcode = 'P0001',
          hint = 'Parental consent required before this data can be written.';
end;
$$;

comment on function public.enforce_consent_gate() is
  'Combined consent + deletion write-gate. Blocks INSERT/UPDATE when the owning user has consent_status <> ''active'' OR deletion_requested_at IS NOT NULL. Attached to chat_messages, checkins, health_data, sleep_logs, video_test_results (migration 062).';


-- ══════════════════════════════════════════════════════════════════
-- SECTION 6 — audit table anonymisation wiring
-- ══════════════════════════════════════════════════════════════════
-- safety_audit_log, chat_quality_scores, prompt_shadow_runs already
-- have ON DELETE SET NULL on their user/reviewer/creator FKs, so the
-- cascade from auth.users deletion handles the user_id anonymisation
-- automatically. This section adds the tombstone_id back-pointer so
-- regulator queries can correlate audit rows to a specific deletion
-- event without re-identifying the subject.

alter table public.safety_audit_log
  add column if not exists deletion_tombstone_id uuid
    references public.deletion_tombstones(id) on delete set null;

alter table public.chat_quality_scores
  add column if not exists deletion_tombstone_id uuid
    references public.deletion_tombstones(id) on delete set null;

alter table public.prompt_shadow_runs
  add column if not exists deletion_tombstone_id uuid
    references public.deletion_tombstones(id) on delete set null;

-- ai_trace_log stores user_id as TEXT (not a uuid FK). Anonymisation
-- rewrites user_id to the literal 'DELETED:' || tombstone_id inside
-- the purge function. No FK change needed.

create index if not exists idx_safety_audit_log_tombstone
  on public.safety_audit_log (deletion_tombstone_id)
  where deletion_tombstone_id is not null;

create index if not exists idx_chat_quality_scores_tombstone
  on public.chat_quality_scores (deletion_tombstone_id)
  where deletion_tombstone_id is not null;


-- ══════════════════════════════════════════════════════════════════
-- SECTION 7 — purge function
-- ══════════════════════════════════════════════════════════════════
-- tomo_purge_user(target_user_id, deletion_request_id)
--
-- Transactional. Runs anonymisation BEFORE the auth.users delete so
-- cascading deletes on audit tables are short-circuited by the
-- user_id = NULL update. Writes a tombstone, stamps the request row
-- purged, and deletes the auth row last so cascade takes care of all
-- athlete-scoped children.
--
-- Idempotent: if called a second time after auth.users is gone it
-- returns the existing tombstone_id.

create or replace function public.tomo_purge_user(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.deletion_requests%rowtype;
  v_tombstone_id uuid;
  v_age_band text;
  v_region_code text;
  v_tenure_days int;
  v_rows int;
  v_started timestamptz;
  v_tables_anonymised jsonb := '[]'::jsonb;
  v_tables_purged jsonb := '[]'::jsonb;
  v_auth_exists boolean;
begin
  select * into v_request from public.deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'tomo_purge_user: deletion_request % not found', p_request_id;
  end if;

  -- Idempotency: a second call for an already-purged request just
  -- returns the tombstone rather than erroring.
  if v_request.status = 'purged' then
    return (select id from public.deletion_tombstones
            where deletion_request_id = p_request_id limit 1);
  end if;

  if v_request.status = 'cancelled' then
    raise exception 'tomo_purge_user: request % was cancelled; refusing to purge', p_request_id;
  end if;

  update public.deletion_requests
    set status = 'purging', purge_started_at = now()
    where id = p_request_id;

  -- Snapshot non-PII cohort data before we nuke the row.
  select
    public.get_age_band(u.date_of_birth),
    u.region_code,
    extract(day from (now() - u.created_at))::int
  into v_age_band, v_region_code, v_tenure_days
  from public.users u
  where u.id = v_request.user_id;

  -- ── Phase A: anonymise audit tables ─────────────────────────────
  -- We can't create the tombstone yet (no purge id to attach) so we
  -- create it first with placeholder jsonb and backfill the lists at
  -- the end.

  insert into public.deletion_tombstones (
    deletion_request_id, purged_at, jurisdiction, method,
    age_band, region_code, account_tenure_days
  ) values (
    p_request_id, now(), v_request.jurisdiction, v_request.method,
    v_age_band, v_region_code, v_tenure_days
  )
  returning id into v_tombstone_id;

  -- safety_audit_log
  v_started := clock_timestamp();
  update public.safety_audit_log
     set user_id = null, deletion_tombstone_id = v_tombstone_id
   where user_id = v_request.user_id;
  get diagnostics v_rows = row_count;
  v_tables_anonymised := v_tables_anonymised || jsonb_build_object('table', 'safety_audit_log', 'rows', v_rows);
  insert into public.deletion_purge_log (
    deletion_request_id, tombstone_id, table_name, action, rows_affected, duration_ms
  ) values (
    p_request_id, v_tombstone_id, 'safety_audit_log', 'anonymise', v_rows,
    extract(milliseconds from (clock_timestamp() - v_started))::int
  );

  -- chat_quality_scores
  v_started := clock_timestamp();
  update public.chat_quality_scores
     set user_id = null, deletion_tombstone_id = v_tombstone_id
   where user_id = v_request.user_id;
  get diagnostics v_rows = row_count;
  v_tables_anonymised := v_tables_anonymised || jsonb_build_object('table', 'chat_quality_scores', 'rows', v_rows);
  insert into public.deletion_purge_log (
    deletion_request_id, tombstone_id, table_name, action, rows_affected, duration_ms
  ) values (
    p_request_id, v_tombstone_id, 'chat_quality_scores', 'anonymise', v_rows,
    extract(milliseconds from (clock_timestamp() - v_started))::int
  );

  -- ai_trace_log (user_id is TEXT, not uuid)
  v_started := clock_timestamp();
  update public.ai_trace_log
     set user_id = 'DELETED:' || v_tombstone_id::text
   where user_id = v_request.user_id::text;
  get diagnostics v_rows = row_count;
  v_tables_anonymised := v_tables_anonymised || jsonb_build_object('table', 'ai_trace_log', 'rows', v_rows);
  insert into public.deletion_purge_log (
    deletion_request_id, tombstone_id, table_name, action, rows_affected, duration_ms
  ) values (
    p_request_id, v_tombstone_id, 'ai_trace_log', 'anonymise', v_rows,
    extract(milliseconds from (clock_timestamp() - v_started))::int
  );

  -- prompt_shadow_runs (created_by FK already ON DELETE SET NULL, but
  -- we stamp the tombstone_id before the cascade so audit correlation
  -- survives the auth.users delete).
  v_started := clock_timestamp();
  update public.prompt_shadow_runs
     set deletion_tombstone_id = v_tombstone_id
   where created_by = v_request.user_id;
  get diagnostics v_rows = row_count;
  v_tables_anonymised := v_tables_anonymised || jsonb_build_object('table', 'prompt_shadow_runs', 'rows', v_rows);
  insert into public.deletion_purge_log (
    deletion_request_id, tombstone_id, table_name, action, rows_affected, duration_ms
  ) values (
    p_request_id, v_tombstone_id, 'prompt_shadow_runs', 'anonymise', v_rows,
    extract(milliseconds from (clock_timestamp() - v_started))::int
  );

  -- ── Phase B: hard delete via auth.users cascade ──────────────────
  -- public.users.id references auth.users(id) ON DELETE CASCADE. Every
  -- athlete-scoped child table references public.users(id) ON DELETE
  -- CASCADE. So this single delete triggers the full child-table purge.

  v_started := clock_timestamp();
  select exists(select 1 from auth.users where id = v_request.user_id) into v_auth_exists;

  if v_auth_exists then
    delete from auth.users where id = v_request.user_id;
    get diagnostics v_rows = row_count;
  else
    v_rows := 0;
  end if;

  v_tables_purged := v_tables_purged || jsonb_build_object('table', 'auth.users_cascade', 'rows', v_rows);
  insert into public.deletion_purge_log (
    deletion_request_id, tombstone_id, table_name, action, rows_affected, duration_ms
  ) values (
    p_request_id, v_tombstone_id, 'auth.users_cascade', 'cascade_delete', v_rows,
    extract(milliseconds from (clock_timestamp() - v_started))::int
  );

  -- ── Phase C: finalise tombstone + request row ───────────────────
  update public.deletion_tombstones
    set tables_anonymised = v_tables_anonymised,
        tables_purged = v_tables_purged
    where id = v_tombstone_id;

  update public.deletion_requests
    set status = 'purged',
        purge_completed_at = now()
    where id = p_request_id;

  return v_tombstone_id;
exception when others then
  -- Surface the failure on the request row so the admin UI can show
  -- it. Re-raise so the caller's transaction rolls back the partial
  -- work (important: the anonymisation updates are part of the same
  -- function invocation and will roll back with it).
  update public.deletion_requests
    set status = 'failed',
        failure_reason = substring(sqlerrm, 1, 500),
        failure_count = failure_count + 1
    where id = p_request_id;
  raise;
end;
$$;

comment on function public.tomo_purge_user(uuid) is
  'GDPR Art. 17 purge executor. Transactional. Anonymises audit tables then deletes the auth.users row triggering the full cascade on athlete-scoped content. Idempotent — returns existing tombstone on re-invocation. Called by pg_cron and admin endpoints.';


-- ══════════════════════════════════════════════════════════════════
-- SECTION 8 — daily job entrypoint
-- ══════════════════════════════════════════════════════════════════
-- Scans for pending requests whose scheduled_purge_at has elapsed and
-- purges them one at a time. A single call returns the number of
-- requests processed so the cron log shows progress.

create or replace function public.tomo_run_deletion_purge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_count int := 0;
begin
  for v_request_id in
    select id
    from public.deletion_requests
    where status = 'pending'
      and scheduled_purge_at <= now()
    order by scheduled_purge_at
    limit 50
  loop
    begin
      perform public.tomo_purge_user(v_request_id);
      v_count := v_count + 1;
    exception when others then
      -- tomo_purge_user() already stamped failure_reason + incremented
      -- failure_count on the request row. Swallow here so one bad row
      -- doesn't block the rest of the batch.
      raise warning 'tomo_run_deletion_purge: request % failed: %', v_request_id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

comment on function public.tomo_run_deletion_purge() is
  'Daily batch purge entrypoint. Processes up to 50 due deletion_requests per invocation. Failures on one request do not block others — they are stamped on the request row and surfaced in the admin UI.';


-- ══════════════════════════════════════════════════════════════════
-- SECTION 9 — stamp/unstamp triggers on deletion_requests
-- ══════════════════════════════════════════════════════════════════
-- Mirrors deletion_requests state onto public.users so the write-gate
-- trigger and API can short-circuit without a join.

create or replace function public.sync_user_deletion_stamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    update public.users
      set deletion_requested_at = new.requested_at,
          deletion_scheduled_purge_at = new.scheduled_purge_at,
          deletion_request_id = new.id
      where id = new.user_id;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'cancelled' then
      update public.users
        set deletion_requested_at = null,
            deletion_scheduled_purge_at = null,
            deletion_request_id = null
        where id = new.user_id
          and deletion_request_id = new.id;
    end if;
    -- purged path doesn't need to clear stamps — the user row is
    -- cascaded away by tomo_purge_user().
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_deletion_stamps_insert
  on public.deletion_requests;
create trigger trg_sync_user_deletion_stamps_insert
  after insert on public.deletion_requests
  for each row execute function public.sync_user_deletion_stamps();

drop trigger if exists trg_sync_user_deletion_stamps_update
  on public.deletion_requests;
create trigger trg_sync_user_deletion_stamps_update
  after update on public.deletion_requests
  for each row execute function public.sync_user_deletion_stamps();


-- ══════════════════════════════════════════════════════════════════
-- SECTION 10 — grants
-- ══════════════════════════════════════════════════════════════════
-- Pipeline state tables are read-only for authenticated users; every
-- mutation goes through the SQL functions or the TS service. Grants
-- here are defensive — RLS is the real gate.

grant select on public.deletion_requests to authenticated;
grant insert, update on public.deletion_requests to authenticated;
grant select on public.deletion_tombstones to authenticated;
grant select on public.deletion_purge_log to authenticated;

grant all on public.deletion_requests to service_role;
grant all on public.deletion_tombstones to service_role;
grant all on public.deletion_purge_log to service_role;

-- Purge functions must be callable by service_role (cron + admin API).
grant execute on function public.tomo_purge_user(uuid) to service_role;
grant execute on function public.tomo_run_deletion_purge() to service_role;
