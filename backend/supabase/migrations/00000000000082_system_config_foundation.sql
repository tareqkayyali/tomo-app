-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 082 — System Config Engine Foundation
-- ═══════════════════════════════════════════════════════════════════════════
--
-- First of several PRs introducing a CMS-configurable engine that owns:
--   - CCRS formula (weights, thresholds, multipliers, recommendation cutoffs)
--   - ACWR config (mode, thresholds, window sizes, load-channel weights)
--   - Intensity catalog (AU/hour per bucket, event-type overrides, defaults)
--   - Intensity resolution (source weights for blended load attribution)
--   - Load attribution (completion triggers, auto-skip windows)
--   - Notifications (push timing, quiet hours, suppression rules)
--
-- This migration ONLY creates the storage + audit scaffolding. No domain
-- schemas or default rows are seeded — those land in follow-up PRs keyed on
-- specific config_key values (e.g. ccrs_formula_v1, acwr_config_v1).
--
-- Design principles (see plan):
--   1. Typed payload validated by Zod on every read + write.
--   2. Hardcoded DEFAULTS in code are the source of truth for cold-boot; DB
--      rows just let ops override.
--   3. Every UPDATE snapshots the prior row into system_config_history so
--      rollback is a one-click SQL operation from the admin UI.
--   4. Rollout is graduated — each config can target a percentage of
--      athletes and/or a sport filter. A stable hash of (athlete_id +
--      config_key) decides which cohort an athlete falls into so reads are
--      deterministic across requests.
--   5. Writes restricted to institutional_pd + super_admin via RLS that
--      inspects organization_memberships.
--
-- Idempotent: every DDL uses IF NOT EXISTS or DROP/CREATE pairs. Safe to
-- re-run during local dev resets.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── system_config ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_config (
  config_key          TEXT PRIMARY KEY,
  payload             JSONB NOT NULL,
  schema_version      INTEGER NOT NULL DEFAULT 1,
  rollout_percentage  SMALLINT NOT NULL DEFAULT 100
                      CHECK (rollout_percentage BETWEEN 0 AND 100),
  sport_filter        TEXT[],                    -- NULL = all sports
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  change_reason       TEXT,
  CONSTRAINT system_config_key_format
    CHECK (config_key ~ '^[a-z][a-z0-9_]*_v[0-9]+$')
  -- Enforces a disciplined naming scheme: lowercase_snake_case with a _v<N>
  -- version suffix (e.g. ccrs_formula_v1). When the payload shape changes in
  -- an incompatible way, a new row is created at v2, traffic migrates via
  -- rollout_percentage, and v1 is deprecated.
);

CREATE INDEX IF NOT EXISTS system_config_enabled_idx
  ON system_config (enabled)
  WHERE enabled = TRUE;

COMMENT ON TABLE  system_config IS 'CMS-configurable engine for formulas, thresholds, and runtime knobs. Every read is validated against a Zod schema in backend/services/config/.';
COMMENT ON COLUMN system_config.config_key IS 'Unique identifier for a config domain + version, e.g. ccrs_formula_v1. Hardcoded DEFAULT lives in code.';
COMMENT ON COLUMN system_config.payload IS 'JSONB payload matching the domain Zod schema. Rejected at API layer if invalid.';
COMMENT ON COLUMN system_config.rollout_percentage IS 'Percentage of athletes eligible for this config. Per-athlete cohort assignment is stable via hash(athlete_id + config_key).';
COMMENT ON COLUMN system_config.sport_filter IS 'NULL = applies to every sport. Otherwise only athletes whose users.sport is in this array receive the row.';


-- ─── system_config_history ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_config_history (
  id                  BIGSERIAL PRIMARY KEY,
  config_key          TEXT NOT NULL,
  payload             JSONB NOT NULL,
  schema_version      INTEGER NOT NULL,
  rollout_percentage  SMALLINT NOT NULL,
  sport_filter        TEXT[],
  enabled             BOOLEAN NOT NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  change_reason       TEXT,
  operation           TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS system_config_history_key_idx
  ON system_config_history (config_key, changed_at DESC);

COMMENT ON TABLE system_config_history IS 'Append-only audit log. Populated by trigger on every INSERT/UPDATE/DELETE of system_config. One-click rollback from the admin UI reads the last history row for a key and re-upserts it as current.';


-- ─── History trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_system_config_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO system_config_history (
      config_key, payload, schema_version, rollout_percentage,
      sport_filter, enabled, changed_at, changed_by, change_reason, operation
    ) VALUES (
      OLD.config_key, OLD.payload, OLD.schema_version, OLD.rollout_percentage,
      OLD.sport_filter, OLD.enabled, NOW(), OLD.updated_by,
      COALESCE(OLD.change_reason, 'deleted'), 'DELETE'
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO system_config_history (
      config_key, payload, schema_version, rollout_percentage,
      sport_filter, enabled, changed_at, changed_by, change_reason, operation
    ) VALUES (
      OLD.config_key, OLD.payload, OLD.schema_version, OLD.rollout_percentage,
      OLD.sport_filter, OLD.enabled, NOW(), NEW.updated_by,
      NEW.change_reason, 'UPDATE'
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO system_config_history (
      config_key, payload, schema_version, rollout_percentage,
      sport_filter, enabled, changed_at, changed_by, change_reason, operation
    ) VALUES (
      NEW.config_key, NEW.payload, NEW.schema_version, NEW.rollout_percentage,
      NEW.sport_filter, NEW.enabled, NOW(), NEW.updated_by,
      COALESCE(NEW.change_reason, 'initial insert'), 'INSERT'
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS system_config_history_trigger ON system_config;
CREATE TRIGGER system_config_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON system_config
  FOR EACH ROW EXECUTE FUNCTION log_system_config_history();


-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Reads: any authenticated user (the loader needs access from API handlers).
-- Writes: institutional_pd or super_admin in the global tenant only.
--
-- Rationale for broad reads: configLoader runs in every request path (CCRS,
-- ACWR, load estimation). If we locked reads behind role checks, every
-- backend request would need to inherit the admin's service role, which
-- defeats the point of RLS. Service-role clients bypass RLS anyway, and
-- this table does not contain athlete PII — just engine parameters.

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_config_read ON system_config;
CREATE POLICY system_config_read ON system_config
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS system_config_write ON system_config;
CREATE POLICY system_config_write ON system_config
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
        AND organization_memberships.is_active = TRUE
        AND organization_memberships.role IN ('super_admin', 'institutional_pd')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
        AND organization_memberships.is_active = TRUE
        AND organization_memberships.role IN ('super_admin', 'institutional_pd')
    )
  );

DROP POLICY IF EXISTS system_config_history_read ON system_config_history;
CREATE POLICY system_config_history_read ON system_config_history
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
        AND organization_memberships.is_active = TRUE
        AND organization_memberships.role IN ('super_admin', 'institutional_pd')
    )
  );

-- History table is INSERT-only via trigger; no update/delete policy needed.
DROP POLICY IF EXISTS system_config_history_no_write ON system_config_history;
CREATE POLICY system_config_history_no_write ON system_config_history
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');


-- ─── Grants ────────────────────────────────────────────────────────────────

GRANT SELECT ON system_config          TO authenticated, anon;
GRANT SELECT ON system_config_history  TO authenticated;
GRANT ALL    ON system_config          TO service_role;
GRANT ALL    ON system_config_history  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE system_config_history_id_seq TO service_role;
