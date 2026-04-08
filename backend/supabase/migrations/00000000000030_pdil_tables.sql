-- ============================================================================
-- Migration 030: Performance Director Intelligence Layer (PDIL)
-- ============================================================================
--
-- The PDIL is Tomo's core IP layer. It sits between the Unified Athlete State
-- (athlete_snapshots + raw data) and ALL downstream consumers (AI Chat, RIE,
-- RAG, My Vitals, Own It, Timeline, Notifications).
--
-- Every recommendation, every coaching response, every load decision flows
-- through PD-authored protocols. The Performance Director's domain expertise
-- is always the baseline — AI operates within PD-defined boundaries.
--
-- Two tables:
--   1. pd_protocols       — The rules themselves (CMS-managed)
--   2. pd_protocol_audit  — Execution log (which rules fired, when, why)
-- ============================================================================

-- ── pd_protocols ─────────────────────────────────────────────────────────────
-- Each row is one protocol authored by the Performance Director.
-- Protocols are evaluated in priority order (lower = higher authority).
-- Conditions are JSONB (bounded DSL). Outputs are typed columns — no JSONB blobs.
-- This makes every output queryable, indexable, and trivially renderable in CMS forms.

CREATE TABLE IF NOT EXISTS pd_protocols (
  protocol_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identity ───────────────────────────────────────────────────────────────
  name            TEXT NOT NULL,
  description     TEXT,                -- Human-readable explanation for CMS
  category        TEXT NOT NULL CHECK (category IN (
                    'safety',           -- PHV gates, injury risk, ACWR danger
                    'development',      -- Periodization, strength phases, progression
                    'recovery',         -- Post-match, deload, fatigue management
                    'performance',      -- Peaking, taper, competition prep
                    'academic'          -- Exam period, dual-load, cognitive load
                  )),

  -- ── Activation Conditions ──────────────────────────────────────────────────
  -- Evaluated against AthleteState using a bounded DSL (see types.ts).
  -- The CMS Protocol Builder renders dropdowns — no free-text JSON entry.
  --
  -- Schema: { "match": "all"|"any", "conditions": [{ "field", "operator", "value" }] }
  --
  -- Example:
  --   { "match": "all", "conditions": [
  --       { "field": "acwr", "operator": "gte", "value": 1.5 },
  --       { "field": "readiness_rag", "operator": "eq", "value": "RED" }
  --   ]}
  conditions      JSONB NOT NULL,

  -- ── Priority ───────────────────────────────────────────────────────────────
  -- Lower number = evaluated first = higher authority when conflicts arise.
  --   1–20:   Built-in safety protocols (cannot be deleted)
  --   21–50:  PD safety extensions
  --   51–100: Development/performance protocols
  --   101–200: Experimental/optional
  priority        INT NOT NULL DEFAULT 100,

  -- ══════════════════════════════════════════════════════════════════════════
  -- OUTPUT DOMAIN 1: Training Modifiers
  -- These directly control what training the athlete can do.
  -- Conflict resolution: load_multiplier = MIN, intensity_cap = most restrictive,
  -- contraindications = UNION, required_elements = UNION, session_cap = MIN.
  -- ══════════════════════════════════════════════════════════════════════════
  load_multiplier       DECIMAL(3,2),     -- e.g. 0.70 = 70% of planned load
                                          -- NULL = no opinion (defaults to 1.0)
  intensity_cap         TEXT CHECK (intensity_cap IN ('full','moderate','light','rest')),
                                          -- NULL = no cap (defaults to 'full')
  contraindications     TEXT[],           -- Exercise types BLOCKED
                                          -- e.g. ARRAY['barbell_back_squat','depth_jumps']
  required_elements     TEXT[],           -- Exercise types MANDATED
                                          -- e.g. ARRAY['hip_hinge_bodyweight','glute_bridge']
  session_cap_minutes   INT,              -- Max session duration when protocol active
                                          -- NULL = no cap

  -- ══════════════════════════════════════════════════════════════════════════
  -- OUTPUT DOMAIN 2: Recommendation Guardrails
  -- Controls what the Recommendation Intelligence Engine (RIE) can generate.
  -- Conflict: blocked = UNION, mandatory = UNION, priority = highest rank.
  -- ══════════════════════════════════════════════════════════════════════════
  blocked_rec_categories    TEXT[],        -- RIE MUST NOT generate recs in these
                                          -- e.g. ARRAY['max_strength','power_development']
  mandatory_rec_categories  TEXT[],        -- RIE MUST generate a rec in these
                                          -- e.g. ARRAY['recovery','sleep_optimisation']
  priority_override         TEXT CHECK (priority_override IN ('P0','P1','P2','P3')),
                                          -- Override rec priority level
                                          -- P0 = critical (never seen before, reserved for safety)
  override_message          TEXT,          -- Shown to athlete, takes precedence over AI message
                                          -- Max ~280 chars — short, clear, actionable

  -- ══════════════════════════════════════════════════════════════════════════
  -- OUTPUT DOMAIN 3: RAG Overrides
  -- Controls what knowledge chunks the RAG retriever includes/excludes.
  -- Ensures PHV-mid athletes get PHV-safe chunks, not generic ones.
  -- Conflict: forced_domains = UNION, blocked_domains = UNION, tags merged.
  -- ══════════════════════════════════════════════════════════════════════════
  forced_rag_domains    TEXT[],           -- RAG MUST include chunks tagged with these
                                          -- e.g. ARRAY['phv_mid','load_management']
  blocked_rag_domains   TEXT[],           -- RAG MUST NOT include chunks tagged with these
                                          -- e.g. ARRAY['max_strength_training']
  rag_condition_tags    JSONB,            -- Merged into ragConditions for this athlete
                                          -- e.g. {"phv": "mid", "domain": "recovery"}

  -- ══════════════════════════════════════════════════════════════════════════
  -- OUTPUT DOMAIN 4: AI Coaching Context
  -- Injected into the AI system prompt BEFORE conversation history.
  -- This is the highest-attention position — the AI model pays maximum
  -- attention to instructions placed early in the system prompt.
  -- Conflict: instructions concatenated in priority order, safety = OR.
  -- ══════════════════════════════════════════════════════════════════════════
  ai_system_injection   TEXT,             -- Injected verbatim into system prompt
                                          -- Position: after athlete state, before history
                                          -- Write as if you're briefing a coaching assistant
  safety_critical       BOOLEAN DEFAULT FALSE,
                                          -- TRUE: forces Claude Sonnet (never Haiku)
                                          -- Use for: PHV-mid, injury, ACWR danger
                                          -- The model tier is PD-controlled, not dev-controlled

  -- ── Scope Filters (pre-conditions before evaluating conditions) ────────
  -- NULL = applies to all athletes. Non-null = only athletes matching filter.
  -- These are checked BEFORE conditions — cheap pre-filter to avoid
  -- evaluating irrelevant protocols.
  sport_filter          TEXT[],           -- e.g. ARRAY['football','padel']
  phv_filter            TEXT[],           -- e.g. ARRAY['mid','pre']
  age_band_filter       TEXT[],           -- e.g. ARRAY['U13','U15']
  position_filter       TEXT[],           -- e.g. ARRAY['goalkeeper','striker']

  -- ── Behavior ───────────────────────────────────────────────────────────
  is_built_in       BOOLEAN DEFAULT FALSE,
                                          -- TRUE: seeded on deploy, cannot be deleted
                                          -- Thresholds tunable, but protocol stays active
                                          -- This is the immutable safety floor
  is_enabled        BOOLEAN DEFAULT TRUE, -- FALSE: soft-deleted or temporarily disabled
  version           INT DEFAULT 1,        -- Incremented on each CMS update (audit trail)

  -- ── Metadata ───────────────────────────────────────────────────────────
  evidence_source   TEXT,                 -- e.g. "Gabbett 2016", "LTAD Framework"
  evidence_grade    TEXT CHECK (evidence_grade IN ('A','B','C')),
                                          -- A = strong RCT evidence
                                          -- B = observational / expert consensus
                                          -- C = PD experience / emerging research
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes for evaluation performance
CREATE INDEX IF NOT EXISTS idx_pd_protocols_active
  ON pd_protocols(is_enabled, priority ASC)
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_pd_protocols_category
  ON pd_protocols(category, is_enabled);

CREATE INDEX IF NOT EXISTS idx_pd_protocols_safety
  ON pd_protocols(safety_critical)
  WHERE safety_critical = true AND is_enabled = true;

-- ── pd_protocol_audit ────────────────────────────────────────────────────────
-- Every protocol activation is logged. The PD must be able to see exactly
-- which rules fired for any athlete at any time. This is the audit trail
-- that proves Tomo's coaching decisions are evidence-based and traceable.

CREATE TABLE IF NOT EXISTS pd_protocol_audit (
  audit_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL,
  protocol_id         UUID NOT NULL REFERENCES pd_protocols(protocol_id),
  triggered_at        TIMESTAMPTZ DEFAULT now(),

  -- The exact field values that triggered this protocol
  -- e.g. {"acwr": 1.62, "readiness_rag": "RED", "phv_stage": "mid"}
  condition_values    JSONB NOT NULL,

  -- The PDContext fields this protocol contributed to the final output
  -- e.g. {"load_multiplier": 0.70, "intensity_cap": "light", "contraindications": [...]}
  context_applied     JSONB NOT NULL,

  -- Conflict resolution metadata
  resolution_rank     INT,                -- Final priority rank among all active protocols
  was_overridden      BOOLEAN DEFAULT FALSE,
                                          -- TRUE if a higher-priority protocol overrode
                                          -- this protocol's output in a specific domain
  overridden_by       UUID,               -- protocol_id that took precedence

  -- Request correlation
  source_trigger      TEXT,               -- 'boot' | 'chat' | 'event' | 'screen' | 'test'
  source_event_id     UUID                -- If triggered by an athlete_event
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_pd_audit_athlete
  ON pd_protocol_audit(athlete_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_pd_audit_protocol
  ON pd_protocol_audit(protocol_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_pd_audit_recent
  ON pd_protocol_audit(triggered_at DESC);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- pd_protocols: admin-only write, service-role read (no direct user access)
-- pd_protocol_audit: service-role only (written by backend, read by admin CMS)

ALTER TABLE pd_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE pd_protocol_audit ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on pd_protocols"
  ON pd_protocols FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on pd_protocol_audit"
  ON pd_protocol_audit FOR ALL
  USING (true) WITH CHECK (true);
