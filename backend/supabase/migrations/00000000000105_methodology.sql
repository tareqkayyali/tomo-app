-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 105 — Methodology Command Center foundation
-- ═══════════════════════════════════════════════════════════════════════════
-- Self-contained, paste-safe for Supabase Studio SQL Editor.
-- Drops any partial state from earlier failed runs, then creates everything.
-- Safe to re-run any number of times.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Clean any partial state from earlier failed runs ─────────────────────
-- Drop tables first with CASCADE (this also removes any dependent triggers).
-- DROP TRIGGER IF EXISTS still requires the parent table to exist, so we
-- skip explicit trigger drops and let CASCADE handle them.

DROP TABLE IF EXISTS public.methodology_directive_audit    CASCADE;
DROP TABLE IF EXISTS public.methodology_publish_snapshots  CASCADE;
DROP TABLE IF EXISTS public.methodology_directives         CASCADE;
DROP TABLE IF EXISTS public.methodology_documents          CASCADE;

DROP FUNCTION IF EXISTS log_methodology_directive_audit() CASCADE;
DROP FUNCTION IF EXISTS methodology_set_updated_at()      CASCADE;


-- ─── methodology_documents ────────────────────────────────────────────────

CREATE TABLE public.methodology_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  audience            TEXT NOT NULL DEFAULT 'all'
                      CHECK (audience IN ('athlete', 'coach', 'parent', 'all')),
  sport_scope         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  age_scope           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_format       TEXT NOT NULL
                      CHECK (source_format IN ('markdown', 'pdf', 'docx', 'plain')),
  source_text         TEXT,
  source_file_url     TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'under_review', 'published', 'archived')),
  version             INTEGER NOT NULL DEFAULT 1,
  parent_version_id   UUID REFERENCES public.methodology_documents(id) ON DELETE SET NULL,
  authored_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX methodology_documents_status_idx
  ON public.methodology_documents (status, updated_at DESC);
CREATE INDEX methodology_documents_audience_idx
  ON public.methodology_documents (audience);

COMMENT ON TABLE  public.methodology_documents IS
  'Prose methodology authored or uploaded by a PD. Parsed into methodology_directives. Runtime never reads prose.';


-- ─── methodology_directives ───────────────────────────────────────────────

CREATE TABLE public.methodology_directives (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             UUID REFERENCES public.methodology_documents(id) ON DELETE SET NULL,
  schema_version          INTEGER NOT NULL DEFAULT 1,
  directive_type          TEXT NOT NULL CHECK (directive_type IN (
                            'identity', 'tone', 'response_shape',
                            'guardrail_phv', 'guardrail_age', 'guardrail_load', 'safety_gate',
                            'threshold', 'performance_model', 'mode_definition',
                            'planning_policy', 'scheduling_policy',
                            'routing_intent', 'routing_classifier', 'recommendation_policy',
                            'rag_policy', 'memory_policy',
                            'surface_policy', 'escalation',
                            'coach_dashboard_policy', 'parent_report_policy',
                            'meta_parser', 'meta_conflict'
                          )),
  audience                TEXT NOT NULL DEFAULT 'all'
                          CHECK (audience IN ('athlete', 'coach', 'parent', 'all')),
  sport_scope             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  age_scope               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  phv_scope               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  position_scope          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mode_scope              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  priority                SMALLINT NOT NULL DEFAULT 100,
  payload                 JSONB NOT NULL,
  source_excerpt          TEXT,
  confidence              NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status                  TEXT NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed', 'approved', 'published', 'retired')),
  approved_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at             TIMESTAMPTZ,
  retired_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason           TEXT
);

CREATE INDEX methodology_directives_type_status_idx
  ON public.methodology_directives (directive_type, status);
CREATE INDEX methodology_directives_status_idx
  ON public.methodology_directives (status, updated_at DESC);
CREATE INDEX methodology_directives_document_idx
  ON public.methodology_directives (document_id);
CREATE INDEX methodology_directives_approved_lookup_idx
  ON public.methodology_directives (status, audience, directive_type)
  WHERE status IN ('approved', 'published');

COMMENT ON TABLE  public.methodology_directives IS
  '23 closed directive types. Payload validated by Zod (backend) and Pydantic (ai-service). Resolver reads from published snapshots, not this table directly.';


-- ─── methodology_directive_audit ─────────────────────────────────────────

CREATE TABLE public.methodology_directive_audit (
  id                  BIGSERIAL PRIMARY KEY,
  directive_id        UUID NOT NULL,
  operation           TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_payload         JSONB,
  new_payload         JSONB,
  old_status          TEXT,
  new_status          TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason       TEXT
);

CREATE INDEX methodology_directive_audit_directive_idx
  ON public.methodology_directive_audit (directive_id, changed_at DESC);
CREATE INDEX methodology_directive_audit_changed_at_idx
  ON public.methodology_directive_audit (changed_at DESC);

COMMENT ON TABLE public.methodology_directive_audit IS
  'Append-only audit log. Populated by trigger on every INSERT/UPDATE/DELETE of methodology_directives.';


-- ─── Audit trigger function ──────────────────────────────────────────────

CREATE FUNCTION log_methodology_directive_audit()
RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.methodology_directive_audit (
      directive_id, operation, old_payload, new_payload,
      old_status, new_status, changed_at, changed_by, change_reason
    ) VALUES (
      OLD.id, 'DELETE', OLD.payload, NULL,
      OLD.status, NULL, NOW(), OLD.updated_by,
      COALESCE(OLD.change_reason, 'deleted')
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.methodology_directive_audit (
      directive_id, operation, old_payload, new_payload,
      old_status, new_status, changed_at, changed_by, change_reason
    ) VALUES (
      OLD.id, 'UPDATE', OLD.payload, NEW.payload,
      OLD.status, NEW.status, NOW(), NEW.updated_by,
      NEW.change_reason
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.methodology_directive_audit (
      directive_id, operation, old_payload, new_payload,
      old_status, new_status, changed_at, changed_by, change_reason
    ) VALUES (
      NEW.id, 'INSERT', NULL, NEW.payload,
      NULL, NEW.status, NOW(), NEW.updated_by,
      COALESCE(NEW.change_reason, 'initial insert')
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER methodology_directive_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.methodology_directives
  FOR EACH ROW EXECUTE FUNCTION log_methodology_directive_audit();


-- ─── methodology_publish_snapshots ────────────────────────────────────────

CREATE TABLE public.methodology_publish_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label               TEXT NOT NULL,
  notes               TEXT,
  directives          JSONB NOT NULL,
  directive_count     INTEGER NOT NULL,
  schema_version      INTEGER NOT NULL DEFAULT 1,
  is_live             BOOLEAN NOT NULL DEFAULT FALSE,
  published_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX methodology_publish_snapshots_one_live
  ON public.methodology_publish_snapshots (is_live)
  WHERE is_live = TRUE;

CREATE INDEX methodology_publish_snapshots_published_at_idx
  ON public.methodology_publish_snapshots (published_at DESC);

COMMENT ON TABLE public.methodology_publish_snapshots IS
  'Immutable frozen directive sets. Exactly one row has is_live = TRUE. Resolver in ai-service loads the live row at process start (60s TTL).';


-- ─── updated_at trigger function + triggers ──────────────────────────────

CREATE FUNCTION methodology_set_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER methodology_documents_updated_at
  BEFORE UPDATE ON public.methodology_documents
  FOR EACH ROW EXECUTE FUNCTION methodology_set_updated_at();

CREATE TRIGGER methodology_directives_updated_at
  BEFORE UPDATE ON public.methodology_directives
  FOR EACH ROW EXECUTE FUNCTION methodology_set_updated_at();


-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.methodology_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.methodology_directives         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.methodology_directive_audit    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.methodology_publish_snapshots  ENABLE ROW LEVEL SECURITY;

CREATE POLICY methodology_documents_admin_read ON public.methodology_documents
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );

CREATE POLICY methodology_documents_admin_write ON public.methodology_documents
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );

CREATE POLICY methodology_directives_admin_read ON public.methodology_directives
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );

CREATE POLICY methodology_directives_admin_write ON public.methodology_directives
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );

CREATE POLICY methodology_directive_audit_admin_read ON public.methodology_directive_audit
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );

CREATE POLICY methodology_directive_audit_service_write ON public.methodology_directive_audit
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY methodology_publish_snapshots_read ON public.methodology_publish_snapshots
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY methodology_publish_snapshots_admin_write ON public.methodology_publish_snapshots
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.is_active = TRUE
        AND om.role IN ('super_admin', 'institutional_pd')
    )
  );


-- ─── Grants ──────────────────────────────────────────────────────────────

GRANT SELECT                         ON public.methodology_documents          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_documents          TO service_role;

GRANT SELECT                         ON public.methodology_directives         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_directives         TO service_role;

GRANT SELECT                         ON public.methodology_directive_audit    TO authenticated;
GRANT SELECT, INSERT                 ON public.methodology_directive_audit    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE methodology_directive_audit_id_seq            TO service_role, authenticated;

GRANT SELECT                         ON public.methodology_publish_snapshots  TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_publish_snapshots  TO service_role;
