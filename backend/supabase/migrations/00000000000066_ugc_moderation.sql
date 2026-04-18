-- Migration 066: User-Generated Content Moderation Pipeline
--
-- Apple App Store Review Guideline 1.2 mandates four mechanisms for
-- every app with user-to-user content:
--   (a) EULA prohibiting objectionable content — covered by the TOS
--       consent type (migration 065).
--   (b) Filtering method — this migration + the moderate() wrapper in
--       services/moderation/moderate.ts that classifies every UGC
--       write via OpenAI's Moderation API.
--   (c) Reporting mechanism — ugc_reports table + POST /api/v1/ugc/
--       reports endpoint.
--   (d) User-blocking — ugc_blocks table + POST /api/v1/ugc/blocks.
--   (e) Admin contact — surfaced via consent_documents (migration 065).
--
-- Tomo will ship with coach and parent annotations visible to a minor
-- athlete (P2 feature). Apple reviewer will flag this as UGC the moment
-- we submit. This migration lands the enforcement substrate so the
-- moderation wrapper has somewhere to write.
--
-- Design principles:
--   1. Every UGC write passes through a pure moderate() wrapper. The
--      wrapper itself is swappable; the decision logic is pure and
--      testable. Vendor today is OpenAI Moderation API; swap to Azure
--      AI Content Safety when EU data residency is required.
--   2. auto-hide before author-echo for severity='critical'. The
--      author must never see their own content echoed back if the
--      classifier flagged it as harmful — prevents feedback loops.
--   3. 24-hour SLA on open reports. sla_due_at is populated by a
--      BEFORE INSERT trigger (not a generated column — timestamptz +
--      interval is STABLE, not IMMUTABLE, so Postgres rejects it as a
--      generation expression). Trigger preserves tz semantics and
--      leaves room for per-report-type SLAs later.
--   4. Blocks enforced via blockFilter() at read sites. DB-level
--      enforcement would require rewriting every UGC read query —
--      application layer is the pragmatic choice.
--   5. Every admin action writes ugc_actions. No silent mod actions.
--
-- Idempotent.

-- ═══════════════════════════════════════════════════════════════════
--  ugc_reports — user-filed reports against content
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ugc_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete set null,
  target_type text not null check (target_type in (
    'event_annotation','chat_message','coach_note','journal_entry','user_profile'
  )),
  target_id uuid not null,
  reason text not null check (reason in (
    'spam','harassment','sexual','self_harm','minor_safety','misinformation','other'
  )),
  notes text,
  status text not null default 'open' check (status in (
    'open','triaged','actioned','dismissed'
  )),
  opened_at timestamptz not null default now(),
  -- 24-hour SLA per DSA Art. 14 + Apple 1.2 "timely action" requirement.
  -- Populated by set_ugc_report_sla_due_at() trigger below.
  sla_due_at timestamptz not null,
  resolved_at timestamptz,
  resolution text
);

create or replace function public.set_ugc_report_sla_due_at()
returns trigger
language plpgsql
as $$
begin
  new.sla_due_at := new.opened_at + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists trg_ugc_reports_sla_due_at on public.ugc_reports;
create trigger trg_ugc_reports_sla_due_at
  before insert or update of opened_at on public.ugc_reports
  for each row execute function public.set_ugc_report_sla_due_at();

comment on table public.ugc_reports is
  'User-filed reports against objectionable content. 24h SLA tracked via sla_due_at generated column — pg_cron surfaces overdue items to admin dashboard + pages on-call. Every report gets at least triaged status within 24h per Apple 1.2 and DSA Art. 14.';

create index if not exists idx_ugc_reports_status_opened
  on public.ugc_reports (status, opened_at desc)
  where status in ('open','triaged');

create index if not exists idx_ugc_reports_overdue
  on public.ugc_reports (sla_due_at)
  where status in ('open','triaged');

create index if not exists idx_ugc_reports_target
  on public.ugc_reports (target_type, target_id);

alter table public.ugc_reports enable row level security;

drop policy if exists "Reporters read own reports" on public.ugc_reports;
create policy "Reporters read own reports"
  on public.ugc_reports
  for select
  using (reporter_id = auth.uid());

drop policy if exists "Reporters file reports" on public.ugc_reports;
create policy "Reporters file reports"
  on public.ugc_reports
  for insert
  with check (reporter_id = auth.uid());

drop policy if exists "Admins read all reports" on public.ugc_reports;
create policy "Admins read all reports"
  on public.ugc_reports
  for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists "Admins action reports" on public.ugc_reports;
create policy "Admins action reports"
  on public.ugc_reports
  for update
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select, insert on public.ugc_reports to authenticated;
grant all on public.ugc_reports to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  ugc_blocks — user-initiated blocks
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ugc_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'full' check (scope in (
    'full','messages_only','visibility_only'
  )),
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

comment on table public.ugc_blocks is
  'Symmetric user-to-user blocks. Enforced at every UGC read site via blockFilter() helper. Three scopes: full (block all interaction), messages_only (hide messages but keep visibility), visibility_only (hide profile but allow mentions in shared contexts).';

create index if not exists idx_ugc_blocks_blocker on public.ugc_blocks (blocker_id);
create index if not exists idx_ugc_blocks_blocked on public.ugc_blocks (blocked_id);

alter table public.ugc_blocks enable row level security;

drop policy if exists "Users manage own blocks" on public.ugc_blocks;
create policy "Users manage own blocks"
  on public.ugc_blocks
  for all
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- Blocked users can see they are blocked (read-only). Transparent
-- blocking is required by Apple — blocked user must not see the
-- blocker's content but should not be silently ignored.
drop policy if exists "Blocked users read own block-state" on public.ugc_blocks;
create policy "Blocked users read own block-state"
  on public.ugc_blocks
  for select
  using (blocked_id = auth.uid());

grant select, insert, delete on public.ugc_blocks to authenticated;
grant all on public.ugc_blocks to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  ugc_moderation_queue — classifier/report-driven review queue
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ugc_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in (
    'event_annotation','chat_message','coach_note','journal_entry','user_profile'
  )),
  target_id uuid not null,
  trigger text not null check (trigger in (
    'report','classifier','keyword','first_post'
  )),
  classifier_score jsonb,            -- per-category {toxicity, sexual, self_harm, ...}
  severity text not null check (severity in ('low','med','high','critical')),
  state text not null default 'pending' check (state in (
    'pending','auto_hidden','human_review','cleared','removed'
  )),
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

comment on table public.ugc_moderation_queue is
  'Every UGC write passes through moderate() which writes a row here when severity >= low OR any report references the target. severity=critical auto-sets state=auto_hidden before the author sees their content echoed. Reviewer workflow: pending → human_review → (cleared|removed).';

create index if not exists idx_ugc_queue_state_created
  on public.ugc_moderation_queue (state, created_at desc)
  where state in ('pending','auto_hidden','human_review');

create index if not exists idx_ugc_queue_target
  on public.ugc_moderation_queue (target_type, target_id);

alter table public.ugc_moderation_queue enable row level security;

drop policy if exists "Admins manage moderation queue" on public.ugc_moderation_queue;
create policy "Admins manage moderation queue"
  on public.ugc_moderation_queue
  for all
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select, update on public.ugc_moderation_queue to authenticated;
grant all on public.ugc_moderation_queue to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  ugc_actions — every admin moderation action
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ugc_actions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in (
    'event_annotation','chat_message','coach_note','journal_entry','user_profile'
  )),
  target_id uuid not null,
  action text not null check (action in (
    'hide','remove','warn_author','restrict_author','ban_author','clear'
  )),
  reason_code text not null,
  notes text,
  actor_id uuid not null references auth.users(id),
  report_id uuid references public.ugc_reports(id),
  queue_id uuid references public.ugc_moderation_queue(id),
  created_at timestamptz not null default now()
);

comment on table public.ugc_actions is
  'Append-only log of every moderation action. Links back to triggering report/queue row. Preserved through user deletion — the action was taken by an admin and must remain auditable even after the actor account is closed.';

create index if not exists idx_ugc_actions_target_created
  on public.ugc_actions (target_type, target_id, created_at desc);

create index if not exists idx_ugc_actions_actor_created
  on public.ugc_actions (actor_id, created_at desc);

alter table public.ugc_actions enable row level security;

drop policy if exists "Admins read ugc actions" on public.ugc_actions;
create policy "Admins read ugc actions"
  on public.ugc_actions
  for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select on public.ugc_actions to authenticated;
grant all on public.ugc_actions to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
