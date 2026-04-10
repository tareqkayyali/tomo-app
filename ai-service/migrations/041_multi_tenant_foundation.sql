-- ============================================================================
-- Migration 041: Multi-Tenant B2B Foundation
-- Phase 7 of Enterprise Migration
--
-- Creates:
--   1. cms_tenants — Organization hierarchy (Global > Institution > Group)
--   2. organization_memberships — User-to-tenant role assignments
--   3. cms_knowledge_inheritance — Knowledge hierarchy + override rules
--   4. ALTER rag_knowledge_chunks — Add institution_id FK
--   5. ALTER pd_protocols — Add institution_id FK
--   6. ALTER planning_protocols — Add institution_id FK
--   7. RLS policies for all tables
--   8. Helper functions for hierarchy resolution
-- ============================================================================

-- ── 1. Tenant Tiers Enum ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE tenant_tier AS ENUM ('global', 'institution', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE org_role AS ENUM ('super_admin', 'institutional_pd', 'coach', 'analyst', 'athlete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE knowledge_override_type AS ENUM ('inherit', 'extend', 'override', 'block');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. CMS Tenants ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cms_tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  tier            tenant_tier NOT NULL DEFAULT 'institution',
  parent_id       UUID REFERENCES cms_tenants(id) ON DELETE SET NULL,

  -- Branding & config
  config          JSONB NOT NULL DEFAULT '{}',
  branding        JSONB NOT NULL DEFAULT '{}',  -- logo_url, primary_color, secondary_color

  -- Limits
  max_athletes    INT DEFAULT 500,
  max_coaches     INT DEFAULT 50,
  max_knowledge_chunks INT DEFAULT 200,

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  subscription_tier TEXT DEFAULT 'standard',  -- standard, professional, enterprise

  -- Metadata
  contact_email   TEXT,
  contact_name    TEXT,
  country         TEXT,
  timezone        TEXT DEFAULT 'UTC',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cms_tenants_slug ON cms_tenants(slug);
CREATE INDEX IF NOT EXISTS idx_cms_tenants_parent ON cms_tenants(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_tenants_tier ON cms_tenants(tier);
CREATE INDEX IF NOT EXISTS idx_cms_tenants_active ON cms_tenants(is_active) WHERE is_active = true;

-- Seed the global tenant (root of hierarchy)
INSERT INTO cms_tenants (id, name, slug, tier, parent_id, is_active, subscription_tier)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Tomo Global',
  'tomo-global',
  'global',
  NULL,
  true,
  'enterprise'
) ON CONFLICT (slug) DO NOTHING;


-- ── 3. Organization Memberships ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES cms_tenants(id) ON DELETE CASCADE,
  role            org_role NOT NULL DEFAULT 'athlete',

  -- Granular permissions (JSONB for flexibility)
  permissions     JSONB NOT NULL DEFAULT '{}',
  -- e.g. { "can_edit_protocols": true, "can_manage_athletes": true, "can_view_analytics": true }

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each user can only have one role per tenant
  UNIQUE(user_id, tenant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_tenant ON organization_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON organization_memberships(role);
CREATE INDEX IF NOT EXISTS idx_org_memberships_active ON organization_memberships(is_active) WHERE is_active = true;


-- ── 4. Knowledge Inheritance ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cms_knowledge_inheritance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES cms_tenants(id) ON DELETE CASCADE,

  -- What type of knowledge this rule applies to
  knowledge_type  TEXT NOT NULL,  -- 'protocol', 'knowledge_chunk', 'planning_protocol', 'drill', 'program'

  -- Reference to the specific knowledge item (polymorphic FK)
  knowledge_id    TEXT NOT NULL,  -- UUID or TEXT ID depending on source table

  -- How this tenant relates to this knowledge
  override_type   knowledge_override_type NOT NULL DEFAULT 'inherit',
  -- inherit  = use parent's version as-is
  -- extend   = use parent's version + add tenant-specific additions
  -- override = replace parent's version with tenant-specific version
  -- block    = hide this knowledge item from this tenant

  -- Override data (for 'extend' and 'override' types)
  override_data   JSONB,

  -- Audit
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each tenant can only have one rule per knowledge item
  UNIQUE(tenant_id, knowledge_type, knowledge_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_inheritance_tenant ON cms_knowledge_inheritance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_inheritance_type ON cms_knowledge_inheritance(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_inheritance_lookup
  ON cms_knowledge_inheritance(tenant_id, knowledge_type);


-- ── 5. ALTER Existing Tables — Add institution_id ───────────────────────────

-- 5a. rag_knowledge_chunks
ALTER TABLE rag_knowledge_chunks
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES cms_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rag_chunks_institution
  ON rag_knowledge_chunks(institution_id);

-- NULL institution_id = global (visible to all)
COMMENT ON COLUMN rag_knowledge_chunks.institution_id IS
  'NULL = global knowledge (visible to all tenants). Set = institution-specific knowledge.';


-- 5b. pd_protocols
ALTER TABLE pd_protocols
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES cms_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pd_protocols_institution
  ON pd_protocols(institution_id);

COMMENT ON COLUMN pd_protocols.institution_id IS
  'NULL = global protocol. Set = institution-specific protocol. MANDATORY severity = always global.';


-- 5c. planning_protocols
ALTER TABLE planning_protocols
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES cms_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planning_protocols_institution
  ON planning_protocols(institution_id);

COMMENT ON COLUMN planning_protocols.institution_id IS
  'NULL = global planning protocol. Set = institution-specific.';


-- 5d. knowledge_entities (from Phase 5 graph)
ALTER TABLE knowledge_entities
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES cms_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_institution
  ON knowledge_entities(institution_id);


-- ── 6. RLS Policies ─────────────────────────────────────────────────────────

-- 6a. cms_tenants
ALTER TABLE cms_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on cms_tenants"
  ON cms_tenants FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users read their tenants"
  ON cms_tenants FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      -- Global tenant always visible
      tier = 'global'
      OR
      -- User's own tenants
      id IN (
        SELECT tenant_id FROM organization_memberships
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );


-- 6b. organization_memberships
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on org_memberships"
  ON organization_memberships FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users read own memberships"
  ON organization_memberships FOR SELECT
  USING (
    auth.role() = 'authenticated' AND user_id = auth.uid()
  );

CREATE POLICY "PDs and admins read their org memberships"
  ON organization_memberships FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    tenant_id IN (
      SELECT tenant_id FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'institutional_pd') AND is_active = true
    )
  );


-- 6c. cms_knowledge_inheritance
ALTER TABLE cms_knowledge_inheritance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on knowledge_inheritance"
  ON cms_knowledge_inheritance FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read knowledge inheritance for own tenants"
  ON cms_knowledge_inheritance FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    tenant_id IN (
      SELECT tenant_id FROM organization_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );


-- ── 7. Helper Functions ─────────────────────────────────────────────────────

-- 7a. Get tenant ancestry chain (child → parent → global)
CREATE OR REPLACE FUNCTION get_tenant_ancestry(p_tenant_id UUID)
RETURNS UUID[]
LANGUAGE SQL STABLE
AS $$
  WITH RECURSIVE ancestry AS (
    SELECT id, parent_id, ARRAY[id] AS chain
    FROM cms_tenants WHERE id = p_tenant_id
    UNION ALL
    SELECT t.id, t.parent_id, a.chain || t.id
    FROM cms_tenants t
    JOIN ancestry a ON a.parent_id = t.id
    WHERE t.id IS NOT NULL
  )
  SELECT chain FROM ancestry
  ORDER BY array_length(chain, 1) DESC
  LIMIT 1;
$$;


-- 7b. Resolve protocols for a tenant (respecting hierarchy + safety_critical)
-- pd_protocols uses safety_critical (boolean) + is_built_in (boolean) + priority (int)
-- safety_critical + is_built_in = MANDATORY (cannot be overridden at any tier)
CREATE OR REPLACE FUNCTION resolve_protocols_for_tenant(p_tenant_id UUID)
RETURNS TABLE (
  protocol_id UUID,
  name TEXT,
  category TEXT,
  safety_critical BOOLEAN,
  is_built_in BOOLEAN,
  priority INT,
  institution_id UUID,
  source_tier TEXT
)
LANGUAGE SQL STABLE
AS $$
  WITH ancestry AS (
    SELECT unnest(get_tenant_ancestry(p_tenant_id)) AS ancestor_id
  ),
  ranked AS (
    SELECT
      p.protocol_id,
      p.name,
      p.category,
      p.safety_critical,
      p.is_built_in,
      p.priority,
      p.institution_id,
      CASE
        WHEN p.institution_id IS NULL THEN 'global'
        ELSE 'institution'
      END AS source_tier,
      -- Built-in safety protocols always win (priority 0), then closest in hierarchy
      ROW_NUMBER() OVER (
        PARTITION BY p.name, p.category
        ORDER BY
          CASE WHEN p.safety_critical AND p.is_built_in THEN 0 ELSE 1 END,
          p.priority,
          CASE
            WHEN p.institution_id = p_tenant_id THEN 0  -- Own institution
            WHEN p.institution_id IS NULL THEN 2         -- Global
            ELSE 1                                        -- Parent institution
          END
      ) AS rn
    FROM pd_protocols p
    WHERE p.is_enabled = true
      AND (
        p.institution_id IS NULL  -- Global protocols always included
        OR p.institution_id IN (SELECT ancestor_id FROM ancestry)
      )
      -- Check for blocks in knowledge_inheritance (but NEVER block safety_critical + built_in)
      AND (
        (p.safety_critical AND p.is_built_in)
        OR NOT EXISTS (
          SELECT 1 FROM cms_knowledge_inheritance ki
          WHERE ki.tenant_id = p_tenant_id
            AND ki.knowledge_type = 'protocol'
            AND ki.knowledge_id = p.protocol_id::TEXT
            AND ki.override_type = 'block'
        )
      )
  )
  SELECT protocol_id, name, category, safety_critical, is_built_in, priority, institution_id, source_tier
  FROM ranked
  WHERE rn = 1
    -- Built-in safety protocols are ALWAYS included regardless of overrides
    OR (safety_critical AND is_built_in);
$$;


-- 7c. Resolve knowledge chunks for a tenant
CREATE OR REPLACE FUNCTION resolve_knowledge_for_tenant(
  p_tenant_id UUID,
  p_query_embedding vector(512),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  domain TEXT,
  title TEXT,
  content TEXT,
  similarity FLOAT,
  source_tier TEXT
)
LANGUAGE SQL STABLE
AS $$
  WITH ancestry AS (
    SELECT unnest(get_tenant_ancestry(p_tenant_id)) AS ancestor_id
  )
  SELECT
    r.chunk_id,
    r.domain,
    r.title,
    r.content,
    1 - (r.embedding <=> p_query_embedding) AS similarity,
    CASE
      WHEN r.institution_id IS NULL THEN 'global'
      ELSE 'institution'
    END AS source_tier
  FROM rag_knowledge_chunks r
  WHERE
    (r.institution_id IS NULL OR r.institution_id IN (SELECT ancestor_id FROM ancestry))
    AND 1 - (r.embedding <=> p_query_embedding) > p_match_threshold
    AND NOT EXISTS (
      SELECT 1 FROM cms_knowledge_inheritance ki
      WHERE ki.tenant_id = p_tenant_id
        AND ki.knowledge_type = 'knowledge_chunk'
        AND ki.knowledge_id = r.chunk_id::TEXT
        AND ki.override_type = 'block'
    )
  ORDER BY r.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;


-- 7d. Get user's role for a tenant
CREATE OR REPLACE FUNCTION get_user_tenant_role(p_user_id UUID, p_tenant_id UUID)
RETURNS org_role
LANGUAGE SQL STABLE
AS $$
  SELECT role FROM organization_memberships
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND is_active = true
  LIMIT 1;
$$;


-- ── 8. Updated Timestamps Trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cms_tenants_updated_at
  BEFORE UPDATE ON cms_tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_memberships_updated_at
  BEFORE UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_inheritance_updated_at
  BEFORE UPDATE ON cms_knowledge_inheritance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 9. Immutability Guard — MANDATORY Protocols ─────────────────────────────

-- Prevent institutions from modifying built-in safety-critical global protocols
CREATE OR REPLACE FUNCTION guard_mandatory_protocol()
RETURNS TRIGGER AS $$
BEGIN
  -- Block if trying to change a built-in safety-critical global protocol
  IF OLD.safety_critical = true AND OLD.is_built_in = true AND OLD.institution_id IS NULL THEN
    -- Prevent reassignment to an institution
    IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
      RAISE EXCEPTION 'Cannot reassign built-in safety protocol to an institution';
    END IF;
    -- Prevent downgrading safety_critical or is_built_in
    IF NEW.safety_critical = false THEN
      RAISE EXCEPTION 'Cannot remove safety_critical from built-in protocol';
    END IF;
    IF NEW.is_built_in = false THEN
      RAISE EXCEPTION 'Cannot remove is_built_in from built-in safety protocol';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_mandatory_protocol_trigger
  BEFORE UPDATE ON pd_protocols
  FOR EACH ROW EXECUTE FUNCTION guard_mandatory_protocol();
