-- Migration 062: Consent Write Gate
--
-- Phase 1 of the registration/onboarding overhaul. Blocks sensitive
-- writes from users whose `consent_status <> 'active'` — the EU/UK
-- 13-15 sandbox state where the child has signed up but the parent
-- has not yet consented.
--
-- Design principles:
--   1. Trigger-based, not RLS. Existing tables already have permissive
--      `for all using (auth.uid() = user_id)` RLS policies; replacing
--      them is invasive. A BEFORE INSERT/UPDATE trigger is additive.
--   2. Applied uniformly. Every table that stores minor-sensitive PII
--      (chat, wellness, biometrics, video tests) gets the same trigger
--      so we can't forget a table.
--   3. Blocks INSERT + UPDATE; leaves DELETE unblocked so the GDPR
--      delete endpoint still works for restricted accounts.
--   4. Single source of truth. The trigger reads
--      public.users.consent_status; bumping a user to 'active' or back
--      to 'awaiting_parent' takes effect immediately on the next write.
--
-- Idempotent: triggers use DROP TRIGGER IF EXISTS before CREATE.

-- ── Trigger function ───────────────────────────────────────────────
create or replace function public.enforce_consent_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  -- Read consent status for the row's owner. SECURITY DEFINER lets
  -- this bypass RLS on users when the caller's session can't select
  -- another user's row (which is never the case here, but makes the
  -- trigger robust if the column is later locked down).
  select consent_status into v_status
  from public.users
  where id = new.user_id;

  -- Adults and consented minors pass. If the user row doesn't exist
  -- yet (shouldn't happen given FK), default-allow so the FK error
  -- surfaces instead of a cryptic consent error.
  if v_status is null or v_status = 'active' then
    return new;
  end if;

  -- Restricted states block the write with a structured error the
  -- API layer can translate into a user-facing card.
  raise exception 'consent_gate: write blocked for user_id=% (consent_status=%)', new.user_id, v_status
    using errcode = 'P0001',
          hint = 'Parental consent required before this data can be written.';
end;
$$;

comment on function public.enforce_consent_gate() is
  'Trigger function that blocks INSERT/UPDATE on minor-sensitive tables when the owning user''s consent_status is not ''active''. Attached to chat_messages, checkins, health_data, sleep_logs, video_test_results.';

-- ── Attach trigger to every sensitive table ────────────────────────
-- Each block uses DROP ... IF EXISTS + CREATE to stay idempotent.

drop trigger if exists trg_consent_gate_chat_messages on public.chat_messages;
create trigger trg_consent_gate_chat_messages
  before insert or update on public.chat_messages
  for each row execute function public.enforce_consent_gate();

drop trigger if exists trg_consent_gate_checkins on public.checkins;
create trigger trg_consent_gate_checkins
  before insert or update on public.checkins
  for each row execute function public.enforce_consent_gate();

drop trigger if exists trg_consent_gate_health_data on public.health_data;
create trigger trg_consent_gate_health_data
  before insert or update on public.health_data
  for each row execute function public.enforce_consent_gate();

drop trigger if exists trg_consent_gate_sleep_logs on public.sleep_logs;
create trigger trg_consent_gate_sleep_logs
  before insert or update on public.sleep_logs
  for each row execute function public.enforce_consent_gate();

drop trigger if exists trg_consent_gate_video_test_results on public.video_test_results;
create trigger trg_consent_gate_video_test_results
  before insert or update on public.video_test_results
  for each row execute function public.enforce_consent_gate();
