-- Migration 061: Data Retention Columns
--
-- Phase 1 of the registration/onboarding overhaul. Adds
-- retention_expires_at to every table that stores minor-sensitive
-- data so a scheduled purge job (backend/services/retention/
-- scheduledPurge.ts) can delete rows past their expiry.
--
-- Retention defaults (applied at row-insert time by the API, not by
-- this migration):
--   - health_data, sleep_logs, checkins, video_test_results: 24 months
--   - chat_messages, chat_session_summaries: 6 months
--
-- The user can extend retention in Settings; the API updates this
-- column row-by-row rather than running a blanket UPDATE.
--
-- Idempotent: all columns and indexes use IF NOT EXISTS.

-- ── Wellness + biometrics: 24-month default ────────────────────────
alter table public.health_data
  add column if not exists retention_expires_at timestamptz;

comment on column public.health_data.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. NULL means retain indefinitely (adult user who extended retention). Set to now() + 24 months by API on insert for under-18 users.';

alter table public.sleep_logs
  add column if not exists retention_expires_at timestamptz;

comment on column public.sleep_logs.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. See health_data for default policy.';

alter table public.checkins
  add column if not exists retention_expires_at timestamptz;

comment on column public.checkins.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. See health_data for default policy.';

alter table public.video_test_results
  add column if not exists retention_expires_at timestamptz;

comment on column public.video_test_results.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. Videos in object storage are deleted in the same purge pass.';

-- ── Chat: 6-month default (shorter because higher sensitivity) ─────
alter table public.chat_messages
  add column if not exists retention_expires_at timestamptz;

comment on column public.chat_messages.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. Default 6 months from insert for minors; chat content is higher sensitivity than biometrics.';

alter table public.chat_session_summaries
  add column if not exists retention_expires_at timestamptz;

comment on column public.chat_session_summaries.retention_expires_at is
  'Row is eligible for scheduled purge after this timestamp. Summaries follow the same policy as chat_messages.';

-- ── Indexes to make the purge job cheap ────────────────────────────
-- Partial indexes: only rows with an expiry set are purgeable, and the
-- purge job scans in ascending order. A partial index on the expiry
-- keeps the B-tree narrow when most rows are NULL (adults).
create index if not exists idx_health_data_retention
  on public.health_data (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists idx_sleep_logs_retention
  on public.sleep_logs (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists idx_checkins_retention
  on public.checkins (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists idx_video_test_results_retention
  on public.video_test_results (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists idx_chat_messages_retention
  on public.chat_messages (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists idx_chat_session_summaries_retention
  on public.chat_session_summaries (retention_expires_at)
  where retention_expires_at is not null;
