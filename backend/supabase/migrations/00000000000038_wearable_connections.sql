-- ============================================================
-- WEARABLE CONNECTIONS — OAuth token storage + sync state
-- ============================================================
-- This table may already exist in production (created manually).
-- All statements use IF NOT EXISTS for idempotent safety.

CREATE TABLE IF NOT EXISTS public.wearable_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  external_user_id TEXT,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  sync_status TEXT DEFAULT 'idle',
  sync_error TEXT,
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint required by whoopService.ts upsert (onConflict: "user_id,provider")
CREATE UNIQUE INDEX IF NOT EXISTS idx_wearable_conn_user_provider
  ON public.wearable_connections(user_id, provider);

-- Fast lookup by provider for admin queries
CREATE INDEX IF NOT EXISTS idx_wearable_conn_provider
  ON public.wearable_connections(provider);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.wearable_connections ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own connections (Settings screen status check)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wearable_connections' AND policyname = 'Users read own wearable connections'
  ) THEN
    CREATE POLICY "Users read own wearable connections"
      ON public.wearable_connections FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role has full access (sync writes, OAuth token storage)
-- service_role bypasses RLS by default, but explicit policy for clarity
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wearable_connections' AND policyname = 'Service role full access wearable connections'
  ) THEN
    CREATE POLICY "Service role full access wearable connections"
      ON public.wearable_connections FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── Ensure all columns exist (safe for tables created manually with fewer columns) ──
DO $$ BEGIN
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS external_user_id TEXT;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS scopes TEXT[];
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'idle';
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS sync_error TEXT;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
  ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
END $$;
