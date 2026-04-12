-- LangSmith Feedback Loop — Local Trace Log
-- Written by persist_node on every chat turn. Contains the same 40+ metadata
-- fields that go to LangSmith, but stored locally for the collector to query.
-- This decouples the feedback loop from LangSmith API read access.

CREATE TABLE ai_trace_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  request_id       TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  message          TEXT NOT NULL DEFAULT '',

  -- Core routing
  path_type        TEXT,         -- capsule | full_ai | confirmed_write
  agent_type       TEXT,
  classification_layer TEXT,     -- exact_match | haiku | fallthrough | agent_lock
  intent_id        TEXT,
  routing_confidence NUMERIC(4,3),

  -- Tools
  tool_count       INTEGER DEFAULT 0,
  tool_names       TEXT[] DEFAULT '{}',

  -- Cost + Performance
  total_cost_usd   NUMERIC(10,6) DEFAULT 0,
  total_tokens     INTEGER DEFAULT 0,
  latency_ms       NUMERIC(10,2) DEFAULT 0,

  -- Validation
  validation_passed BOOLEAN DEFAULT TRUE,
  validation_flags  TEXT[] DEFAULT '{}',

  -- Safety
  phv_gate_fired   BOOLEAN DEFAULT FALSE,
  crisis_detected  BOOLEAN DEFAULT FALSE,
  ped_detected     BOOLEAN DEFAULT FALSE,
  medical_warning  BOOLEAN DEFAULT FALSE,

  -- RAG
  rag_used         BOOLEAN DEFAULT FALSE,
  rag_entity_count INTEGER DEFAULT 0,
  rag_chunk_count  INTEGER DEFAULT 0,
  rag_cost_usd     NUMERIC(10,6) DEFAULT 0,
  rag_latency_ms   NUMERIC(10,2) DEFAULT 0,

  -- Athlete context
  sport            TEXT,
  age_band         TEXT,
  phv_stage        TEXT,
  readiness_score  INTEGER,
  readiness_rag    TEXT,          -- Green | Yellow | Red
  injury_risk      TEXT,          -- GREEN | YELLOW | RED
  acwr             NUMERIC(4,2),
  acwr_bucket      TEXT,          -- safe | caution | danger
  data_confidence_score INTEGER,
  checkin_staleness_days INTEGER DEFAULT 0,

  -- Bucketed fields for fast filtering
  cost_bucket      TEXT,          -- free | cheap | moderate | expensive
  latency_bucket   TEXT,          -- fast | normal | slow
  confidence_bucket TEXT,         -- low | medium | high
  tool_bucket      TEXT           -- none | light | heavy
);

-- Indexes for collector queries (6h window, common filters)
CREATE INDEX idx_ai_trace_log_created   ON ai_trace_log (created_at DESC);
CREATE INDEX idx_ai_trace_log_path      ON ai_trace_log (path_type);
CREATE INDEX idx_ai_trace_log_intent    ON ai_trace_log (intent_id);
CREATE INDEX idx_ai_trace_log_cost      ON ai_trace_log (cost_bucket);
CREATE INDEX idx_ai_trace_log_injury    ON ai_trace_log (injury_risk);

-- Auto-cleanup: keep 30 days of traces
-- (Can be extended with pg_cron sweep later)

ALTER TABLE ai_trace_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_trace_log"
  ON ai_trace_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
