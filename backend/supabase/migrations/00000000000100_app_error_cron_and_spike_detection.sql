-- Migration 100: App error cron jobs + ai_issues source constraint update

BEGIN;

ALTER TABLE public.ai_issues DROP CONSTRAINT IF EXISTS ai_issues_source_check;
ALTER TABLE public.ai_issues ADD CONSTRAINT ai_issues_source_check
  CHECK (source IN ('eval','langsmith_trace','manual','cqe_drift','app_error_spike'));

CREATE OR REPLACE FUNCTION public.tomo_rollup_app_error_stats(target_hour timestamptz)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.app_error_stats (
    bucket_hour,
    layer,
    severity,
    error_code,
    fingerprint,
    error_count,
    unique_users,
    unique_sessions,
    sample_error_id
  )
  SELECT
    target_hour AS bucket_hour,
    e.layer,
    e.severity,
    e.error_code,
    e.fingerprint,
    COUNT(*)::int AS error_count,
    COUNT(DISTINCT e.user_id)::int AS unique_users,
    COUNT(DISTINCT e.session_id)::int AS unique_sessions,
    MIN(e.id) AS sample_error_id
  FROM public.app_errors e
  WHERE e.sampled = TRUE
    AND e.created_at >= target_hour
    AND e.created_at < target_hour + INTERVAL '1 hour'
  GROUP BY e.layer, e.severity, e.error_code, e.fingerprint
  ON CONFLICT (
    bucket_hour,
    layer,
    severity,
    (COALESCE(error_code, '')),
    (COALESCE(fingerprint, ''))
  )
  DO UPDATE SET
    error_count = EXCLUDED.error_count,
    unique_users = EXCLUDED.unique_users,
    unique_sessions = EXCLUDED.unique_sessions,
    sample_error_id = EXCLUDED.sample_error_id,
    created_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.tomo_detect_error_spikes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  threshold_critical INT := 50;
  threshold_high INT := 20;
  threshold_medium INT := 5;
  sev TEXT;
  sev_class TEXT;
BEGIN
  FOR r IN
    SELECT
      e.fingerprint,
      e.error_code,
      e.layer,
      COUNT(*)::int AS cnt,
      MIN(e.id) AS sample_error_id,
      MIN(e.created_at) AS first_seen,
      MAX(e.created_at) AS last_seen
    FROM public.app_errors e
    WHERE e.sampled = TRUE
      AND e.created_at >= NOW() - INTERVAL '15 minutes'
      AND COALESCE(e.fingerprint, '') <> ''
    GROUP BY e.fingerprint, e.error_code, e.layer
    HAVING COUNT(*) >= threshold_medium
  LOOP
    IF r.cnt >= threshold_critical THEN
      sev := 'critical';
      sev_class := 'p1_safety';
    ELSIF r.cnt >= threshold_high THEN
      sev := 'high';
      sev_class := 'p2_quality';
    ELSE
      sev := 'medium';
      sev_class := 'p3_cost';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ai_issues i
      WHERE i.source = 'app_error_spike'
        AND i.created_at >= date_trunc('hour', NOW())
        AND COALESCE(i.metadata->>'fingerprint', '') = COALESCE(r.fingerprint, '')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ai_issues (
      week_start,
      issue_type,
      severity,
      affected_count,
      sample_run_ids,
      pattern_summary,
      metadata,
      trend_data,
      recurrence_count,
      last_seen_at,
      status,
      source,
      category,
      severity_class,
      description,
      evidence,
      first_seen_at,
      occurrence_count
    ) VALUES (
      date_trunc('week', NOW())::date,
      'latency_spike',
      sev,
      r.cnt,
      ARRAY[]::text[],
      format('[app_error_spike] %s (%s) spiked to %s events in 15m', COALESCE(r.error_code, 'unknown_error'), COALESCE(r.layer, 'unknown_layer'), r.cnt),
      jsonb_build_object(
        'fingerprint', r.fingerprint,
        'error_code', r.error_code,
        'layer', r.layer,
        'window_minutes', 15
      ),
      '{}'::jsonb,
      1,
      r.last_seen,
      'open',
      'app_error_spike',
      'app_error_spike',
      sev_class,
      format('Auto-detected spike for %s in %s layer', COALESCE(r.error_code, 'unknown_error'), COALESCE(r.layer, 'unknown_layer')),
      jsonb_build_object(
        'sample_error_id', r.sample_error_id,
        'count_15m', r.cnt
      ),
      r.first_seen,
      r.cnt
    );
  END LOOP;
END;
$$;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron extension not installed — skipping app error cron schedules.';
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('app_errors_retention_prune'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('app_error_stats_hourly_rollup'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('app_error_spike_detection'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('app_error_stats_retention_prune'); EXCEPTION WHEN others THEN NULL; END;

  PERFORM cron.schedule(
    'app_errors_retention_prune',
    '15 3 * * *',
    $cron$
      DELETE FROM public.app_errors WHERE created_at < NOW() - INTERVAL '90 days';
      DELETE FROM public.ai_debug_errors WHERE created_at < NOW() - INTERVAL '90 days';
      DELETE FROM public.ai_debug_requests WHERE created_at < NOW() - INTERVAL '90 days';
    $cron$
  );

  PERFORM cron.schedule(
    'app_error_stats_hourly_rollup',
    '5 * * * *',
    $cron$
      SELECT public.tomo_rollup_app_error_stats(date_trunc('hour', NOW()) - INTERVAL '1 hour');
    $cron$
  );

  PERFORM cron.schedule(
    'app_error_spike_detection',
    '*/15 * * * *',
    $cron$
      SELECT public.tomo_detect_error_spikes();
    $cron$
  );

  PERFORM cron.schedule(
    'app_error_stats_retention_prune',
    '20 3 * * *',
    $cron$
      DELETE FROM public.app_error_stats WHERE bucket_hour < NOW() - INTERVAL '90 days';
    $cron$
  );
END
$$;
