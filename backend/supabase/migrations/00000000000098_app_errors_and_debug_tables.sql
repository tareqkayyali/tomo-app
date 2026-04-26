-- Migration 098: Unified app error sink + missing AI debug tables
--
-- Notes:
-- - app_errors is a cross-service correlation layer (mobile/backend/python).
-- - This migration also creates ai_debug_errors + ai_debug_requests tables
--   consumed by ai-service/app/core/debug_logger.py.
-- - Partitioning can be introduced later if monthly rows exceed ~5M.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_errors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id       TEXT,
  request_id     TEXT,
  correlation_id TEXT,
  layer          TEXT NOT NULL CHECK (layer IN ('mobile','backend','python')),
  error_code     TEXT,
  error_type     TEXT,
  message        TEXT NOT NULL,
  stack_trace    TEXT,
  fingerprint    TEXT,
  user_id        UUID,
  session_id     TEXT,
  endpoint       TEXT,
  http_status    INT,
  severity       TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical','high','medium','low','info')),
  sampled        BOOLEAN NOT NULL DEFAULT TRUE,
  environment    TEXT NOT NULL DEFAULT 'production',
  app_version    TEXT,
  platform       TEXT,
  os_version     TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created_at
  ON public.app_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_trace_id
  ON public.app_errors (trace_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_request_id
  ON public.app_errors (request_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_user_time
  ON public.app_errors (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_layer_severity_time
  ON public.app_errors (layer, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_error_code_time
  ON public.app_errors (error_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_fingerprint_time
  ON public.app_errors (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_sampled_true
  ON public.app_errors (created_at DESC)
  WHERE sampled = TRUE;
CREATE INDEX IF NOT EXISTS idx_app_errors_spike_window
  ON public.app_errors (created_at DESC, fingerprint, error_code, layer)
  WHERE sampled = TRUE AND fingerprint IS NOT NULL;

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_errors_service_all ON public.app_errors;
CREATE POLICY app_errors_service_all ON public.app_errors
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS app_errors_admin_read ON public.app_errors;
CREATE POLICY app_errors_admin_read ON public.app_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('super_admin','institutional_pd','analyst')
    )
  );

GRANT SELECT ON public.app_errors TO authenticated;
GRANT ALL ON public.app_errors TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_debug_errors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT,
  session_id      TEXT,
  node            TEXT,
  error_type      TEXT,
  error_message   TEXT NOT NULL,
  traceback       TEXT,
  request_message TEXT,
  intent_id       TEXT,
  severity        TEXT NOT NULL DEFAULT 'error',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_debug_errors_created_at
  ON public.ai_debug_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_debug_errors_user
  ON public.ai_debug_errors (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_debug_errors_node
  ON public.ai_debug_errors (node, created_at DESC);

ALTER TABLE public.ai_debug_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_debug_errors_service_all ON public.ai_debug_errors;
CREATE POLICY ai_debug_errors_service_all ON public.ai_debug_errors
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ai_debug_errors_admin_read ON public.ai_debug_errors;
CREATE POLICY ai_debug_errors_admin_read ON public.ai_debug_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('super_admin','institutional_pd','analyst')
    )
  );

GRANT SELECT ON public.ai_debug_errors TO authenticated;
GRANT ALL ON public.ai_debug_errors TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_debug_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT,
  session_id   TEXT,
  message      TEXT,
  intent_id    TEXT,
  agent        TEXT,
  flow_pattern TEXT,
  status       TEXT NOT NULL DEFAULT 'success',
  latency_ms   NUMERIC(10,2),
  cost_usd     NUMERIC(10,6),
  tokens_used  INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_debug_requests_created_at
  ON public.ai_debug_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_debug_requests_user
  ON public.ai_debug_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_debug_requests_status
  ON public.ai_debug_requests (status, created_at DESC);

ALTER TABLE public.ai_debug_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_debug_requests_service_all ON public.ai_debug_requests;
CREATE POLICY ai_debug_requests_service_all ON public.ai_debug_requests
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ai_debug_requests_admin_read ON public.ai_debug_requests;
CREATE POLICY ai_debug_requests_admin_read ON public.ai_debug_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('super_admin','institutional_pd','analyst')
    )
  );

GRANT SELECT ON public.ai_debug_requests TO authenticated;
GRANT ALL ON public.ai_debug_requests TO service_role;

COMMIT;
