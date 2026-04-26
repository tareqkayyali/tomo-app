-- Migration 099: Pre-aggregated hourly app error stats

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_error_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_hour     TIMESTAMPTZ NOT NULL,
  layer           TEXT NOT NULL CHECK (layer IN ('mobile','backend','python','all')),
  severity        TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info','all')),
  error_code      TEXT,
  fingerprint     TEXT,
  error_count     INT NOT NULL DEFAULT 0,
  unique_users    INT NOT NULL DEFAULT 0,
  unique_sessions INT NOT NULL DEFAULT 0,
  sample_error_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_error_stats_bucket_expr
  ON public.app_error_stats (
    bucket_hour,
    layer,
    severity,
    COALESCE(error_code, ''),
    COALESCE(fingerprint, '')
  );

CREATE INDEX IF NOT EXISTS idx_app_error_stats_bucket_hour
  ON public.app_error_stats (bucket_hour DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_stats_layer_severity
  ON public.app_error_stats (layer, severity, bucket_hour DESC);

ALTER TABLE public.app_error_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_error_stats_service_all ON public.app_error_stats;
CREATE POLICY app_error_stats_service_all ON public.app_error_stats
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS app_error_stats_admin_read ON public.app_error_stats;
CREATE POLICY app_error_stats_admin_read ON public.app_error_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('super_admin','institutional_pd','analyst')
    )
  );

GRANT SELECT ON public.app_error_stats TO authenticated;
GRANT ALL ON public.app_error_stats TO service_role;

COMMIT;
