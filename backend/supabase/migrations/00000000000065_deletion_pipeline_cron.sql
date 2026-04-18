-- Migration 065: Deletion Pipeline Daily Cron
--
-- Schedules tomo_run_deletion_purge() to run daily. Kept in its own
-- migration because pg_cron is only available on Supabase paid tiers
-- and the call to cron.schedule() errors on environments where the
-- extension isn't installed. The DO block below no-ops gracefully on
-- local dev (where pg_cron isn't enabled) and on Supabase Free.
--
-- Schedule: 03:15 UTC daily. Far enough from midnight UTC that any
-- "end of day" events have settled, before UK working hours so the
-- admin UI shows an accurate queue when support comes online.
--
-- Idempotent: unschedule-then-schedule pattern means re-running this
-- migration just updates the cron row in place.

do $$
begin
  -- pg_cron extension check. If not present, skip silently so local
  -- dev doesn't error on `supabase db reset`.
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise notice 'pg_cron extension not installed — skipping deletion purge schedule. Enable pg_cron in the Supabase dashboard (Database → Extensions) and re-run this migration.';
    return;
  end if;

  -- Drop any existing entry with the same name so the schedule is
  -- idempotent. cron.unschedule returns false if the job doesn't
  -- exist; we don't care, just suppress the error.
  begin
    perform cron.unschedule('tomo-deletion-purge-daily');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'tomo-deletion-purge-daily',
    '15 3 * * *',
    $cron$select public.tomo_run_deletion_purge();$cron$
  );

  raise notice 'tomo-deletion-purge-daily scheduled for 03:15 UTC';
end
$$;
