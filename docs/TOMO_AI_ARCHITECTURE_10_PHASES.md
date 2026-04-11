# Tomo AI Enterprise Architecture — 10-Phase Implementation Reference

> **Generated:** April 11, 2026
> **Status:** All 10 phases complete and deployed to production
> **Codebase:** `tomo-app/` (TypeScript Next.js + Python FastAPI + Zep CE)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1: Python Scaffold + LangSmith](#2-phase-1-python-scaffold--langsmith)
3. [Phase 2: Context Assembly + AIB](#3-phase-2-context-assembly--aib)
4. [Phase 3: Zep Memory](#4-phase-3-zep-memory)
5. [Phase 4: LangGraph Orchestrator + 5 Agents](#5-phase-4-langgraph-orchestrator--5-agents)
6. [Phase 5: PropertyGraphIndex RAG](#6-phase-5-propertygraphindex-rag)
7. [Phase 6: Eval Suite + Deploy Gate](#7-phase-6-eval-suite--deploy-gate)
8. [Phase 7: Multi-Tenant B2B Foundation](#8-phase-7-multi-tenant-b2b-foundation)
9. [Phase 8: Enterprise CMS Rebuild](#9-phase-8-enterprise-cms-rebuild)
10. [Phase 9: Shadow Mode + Cutover](#10-phase-9-shadow-mode--cutover)
11. [Phase 10: CMS Visual Builder + Polish](#11-phase-10-cms-visual-builder--polish)
12. [Database Schema](#12-database-schema)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [File Inventory](#14-file-inventory)
15. [Cost Model](#15-cost-model)
16. [Data Flow Diagrams](#16-data-flow-diagrams)

---

## 1. Architecture Overview

### Service Topology

```
Mobile App (React Native / Expo — UNCHANGED)
  │
  ▼
TypeScript Backend (Next.js 16 on Railway — port 8080)
  │  ├── Auth proxy (Bearer token + cookie)
  │  ├── Boot endpoint (/api/v1/boot — 18 parallel queries)
  │  ├── Event pipeline (30 types, 11 handlers, snapshot writer)
  │  ├── Capsule fast-path ($0, ~60-70% of chat traffic)
  │  ├── CRUD APIs (drills, programs, assessments, sports, etc.)
  │  ├── Enterprise CMS (56 admin pages, RBAC, multi-tenant)
  │  └── AI proxy → forwards non-capsule chat to Python
  │
  │  (non-capsule AI traffic, ~30-40%)
  ▼
Python AI Service (FastAPI on Railway — port 8000)
  │  ├── LangGraph Supervisor (8-node state graph)
  │  │     ├── context_assembly_node (11 parallel DB queries, <800ms)
  │  │     ├── rag_retrieval_node (5-signal hybrid search)
  │  │     ├── pre_router_node (3-layer classifier + 5-way agent router)
  │  │     ├── agent_dispatch_node (agentic tool-calling loop)
  │  │     ├── validate_node (4-layer guardrails, PHV safety hard gate)
  │  │     ├── format_response_node (JSON → structured cards)
  │  │     └── persist_node (Zep memory + longitudinal extraction)
  │  │
  │  ├── AIB Pipeline (Athlete Intelligence Brief, Haiku, $0.003/gen)
  │  ├── RAG Pipeline (Voyage embeddings + Cohere rerank + graph traversal)
  │  └── LangSmith auto-tracing (every request logged)
  │
  ▼
Zep CE (Docker on Railway — port 8080)
  │  ├── Session memory (12-message window)
  │  ├── Entity extraction (OpenAI gpt-3.5-turbo)
  │  ├── Fact storage (cross-session temporal facts)
  │  └── Session summarization
  │
  ▼
Supabase PostgreSQL (Production)
     ├── 38+ migrations, RLS on all user-facing tables
     ├── pgvector extension (512-dim Voyage embeddings)
     ├── 107-field athlete_snapshots (360-degree view)
     └── PgBouncer pooler (port 6543) for 3-service connection sharing
```

### Request Flow: Chat Message

```
1. Mobile sends POST /api/v1/chat/agent?stream=true
2. TS Backend: auth check → rate limit (20/min) → guardrail pre-flight
3. Capsule action? → Execute tool directly in TS ($0) → SSE response
4. Non-capsule? → Proxy to Python AI service (Railway internal, <5ms)
5. Python: context_assembly → rag_retrieval → pre_router → agent_dispatch
6. Agent calls 0-5 tools → validate_node → format_response → persist
7. SSE stream: event:status → event:done (structured JSON response)
8. Mobile: ResponseRenderer parses cards, updates UI
```

### SSE Streaming Format

```
event: status
data: {"status":"Thinking..."}

event: status
data: {"status":"Checking your readiness..."}

event: done
data: {"message":"...","structured":{...},"sessionId":"...","refreshTargets":[],"pendingConfirmation":null,"context":{...}}

event: error
data: {"error":"Something went wrong"}
```

---

## 2. Phase 1: Python Scaffold + LangSmith

**Goal:** FastAPI service deployed on Railway with LangSmith auto-tracing and TypeScript proxy forwarding.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| FastAPI app | `ai-service/app/main.py` | 93 | Entry point, lifecycle, CORS, 4 routers |
| Configuration | `ai-service/app/config.py` | 64 | Pydantic Settings, env var validation |
| Health route | `ai-service/app/routes/health.py` | 31 | Railway health check, DB status |
| Chat route | `ai-service/app/routes/chat.py` | 223 | SSE streaming + sync chat endpoints |
| Database | `ai-service/app/db/supabase.py` | 118 | Async psycopg3 pool (Supavisor compatible) |
| State model | `ai-service/app/models/state.py` | 82 | TomoChatState TypedDict for LangGraph |
| TS proxy | `backend/services/agents/aiServiceProxy.ts` | 333 | Stream/sync/shadow proxy to Python |
| Agent route | `backend/app/api/v1/chat/agent/route.ts` | 244 | SSE streaming, capsule fast-path, Python proxy |
| Dockerfile | `ai-service/Dockerfile` | ~20 | Python 3.12, Railway deployment |
| Procfile | `ai-service/Procfile` | 1 | `uvicorn app.main:app --host 0.0.0.0` |

### Key Decisions

- **psycopg3 over asyncpg**: Supabase Supavisor pooler uses dot-format usernames (`user.pooler_suffix`) that asyncpg can't parse. psycopg3 delegates to libpq which handles this natively.
- **PgBouncer port 6543**: All 3 services (TS, Python, Zep) share one connection pool to prevent exhausting Supabase's 60-connection limit.
- **LangSmith auto-tracing**: Setting `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_PROJECT=tomo-ai-production` traces every LangGraph invocation automatically — no manual instrumentation needed.

### Feature Flag: AI_SERVICE_ENABLED

| Value | Behavior |
|---|---|
| `"false"` | All AI traffic uses TypeScript orchestrator (legacy) |
| `"shadow"` | Both TS + Python run; TS serves response, Python traced to LangSmith |
| `"true"` | Python serves response; TS orchestrator bypassed |

Supports `AI_SERVICE_PERCENTAGE` for gradual cutover (10% → 50% → 100%).

### Verification

- Health check: `GET /health` returns service status, DB health, LangSmith enabled
- LangSmith trace visible for every chat request
- SSE stream from Python → TS proxy → mobile confirmed working

---

## 3. Phase 2: Context Assembly + AIB

**Goal:** Port the 11 parallel DB queries from TypeScript `contextBuilder.ts` to Python, plus the Athlete Intelligence Brief generator.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Context assembly | `ai-service/app/graph/nodes/context_assembly.py` | 924 | 11+ parallel async queries via asyncio.gather() |
| Context models | `ai-service/app/models/context.py` | 266 | PlayerContext, SnapshotEnrichment, TemporalContext |
| AIB generator | `ai-service/app/graph/nodes/aib_generator.py` | 364 | Haiku-powered 6-section intelligence brief |
| AIB route | `ai-service/app/routes/aib.py` | 176 | Generate/fetch/debug AIB endpoints |
| Migration 038 | `backend/supabase/migrations/...038...` | ~60 | `athlete_intelligence_briefs` table |

### Context Assembly: 11 Parallel Queries

```python
async def context_assembly_node(state: TomoChatState) -> dict:
    results = await asyncio.gather(
        _fetch_profile(user_id),           # name, sport, age, streak
        _fetch_today_events(user_id, tz),  # calendar events
        _fetch_latest_checkin(user_id),    # readiness components
        _fetch_vitals(user_id),            # HRV, sleep, recovery
        _fetch_test_scores(user_id),       # recent assessments
        _fetch_recommendations(user_id),   # active recs (RIE)
        _fetch_upcoming(user_id),          # exams, events
        _fetch_snapshot(user_id),          # 107-field snapshot
        _fetch_schedule_prefs(user_id),    # dual-load preferences
        _fetch_aib(user_id),              # athlete intelligence brief
        _fetch_longitudinal_memory(user_id),  # cross-session context
        return_exceptions=True,
    )
    # Build PlayerContext from results
    # Target: < 800ms total assembly time
```

### PlayerContext (injected into every AI prompt)

```python
PlayerContext:
  # Identity
  userId, name, sport, position, ageBand, role, gender, heightCm, weightKg
  # Today's state
  todayDate, currentTime, todayEvents[], readinessScore, readinessComponents
  # Performance
  currentStreak, benchmarkProfile (percentile, strengths, gaps)
  # Academic
  upcomingExams[], academicLoadScore
  # Temporal awareness
  temporalContext (timeOfDay, isMatchDay, isExamProximity, dayType)
  # Snapshot enrichment (90+ fields)
  snapshotEnrichment (acwr, atl7day, ctl28day, injuryRiskFlag, ...)
  # Active recommendations
  activeRecommendations[]
  # Planning context
  planningContext (activeMode, applicableProtocols, dualLoadZone)
  # Wearable status
  wearableStatus (whoop: connected, dataFresh, lastSyncAt)
```

### AIB (Athlete Intelligence Brief)

6-section brief generated by Haiku ($0.003/gen), cached by snapshot hash:

1. **Readiness Assessment** — Current state + contributing factors
2. **Load Management** — ACWR, training monotony, dual load
3. **Performance Trends** — Strengths improving, gaps widening
4. **Development Priorities** — What to focus on this week
5. **Behavioral Insights** — Engagement patterns, compliance
6. **Coaching Priorities** — Top 3 actions for today

Staleness check: If snapshot hash changed since last AIB, regenerate. Otherwise serve cached (< 24h).

---

## 4. Phase 3: Zep Memory

**Goal:** Deploy Zep CE on Railway for cross-session memory, entity extraction, and semantic search.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Zep client | `ai-service/app/services/zep_client.py` | 383 | Async httpx client for Zep CE REST API |
| Memory service | `ai-service/app/services/memory_service.py` | 410 | 4-tier memory orchestration |
| Persist node | `ai-service/app/graph/nodes/persist.py` | 125 | Save conversation to Zep + extract memory |
| Zep Dockerfile | `zep-service/Dockerfile` | 23 | Zep CE 0.25 + psql for DB init |
| Zep startup | `zep-service/start.sh` | 93 | Config generation, DB init, port binding |
| Zep DB init | `zep-service/init.sql` | ~10 | pgvector extension creation |
| Railway config | `zep-service/railway.toml` | 8 | Health check, restart policy |
| Backfill script | `ai-service/scripts/backfill_zep_memory.py` | 181 | Migrate existing chat history to Zep |

### 4-Tier Memory Architecture

```
Tier 1: Working Memory (LangGraph state.messages)
  └── Current conversation turn, tool results, system prompt
  └── Scope: single request

Tier 2: Episodic Memory (Zep sessions)
  └── Full conversation history per session (12-message window)
  └── Automatic session summarization
  └── Scope: single chat session

Tier 3: Semantic Memory (Zep facts + entity extraction)
  └── "Tareq prefers morning training sessions"
  └── "Tareq had a knee injury in February 2026"
  └── "Tareq's goal is to improve sprint times before tryouts"
  └── Cross-session facts extracted by OpenAI gpt-3.5-turbo
  └── Scope: all sessions for an athlete

Tier 4: Procedural Memory (AIB + longitudinal memory)
  └── Athlete Intelligence Brief (6 sections, Haiku-generated)
  └── athlete_longitudinal_memory table (Haiku-extracted after 5+ turns)
  └── Goals, unresolved concerns, injury history, behavioral patterns
  └── Scope: all-time athlete context
```

### Zep CE Configuration

```yaml
# Generated at runtime in start.sh
store:
  type: postgres
  postgres:
    dsn: "${DSN}"  # Supabase PgBouncer (port 6543)
server:
  port: ${ZEP_PORT}  # Railway-assigned PORT
auth:
  secret: "${ZEP_AUTH_SECRET}"
  required: true
llm:
  model: gpt-3.5-turbo
  openai_api_key: "${ZEP_OPENAI_API_KEY}"
memory:
  message_window: 12
extractors:
  documents:
    enabled: true
  messages:
    summarizer:
      enabled: true
    entities:
      enabled: true
    intent:
      enabled: false
```

### Zep CE API Paths (v0.25 — singular `/user`)

```
POST   /api/v1/user                         — Create user
GET    /api/v1/user/{userId}                 — Get user
GET    /api/v1/user/{userId}/sessions        — List user sessions
POST   /api/v1/sessions                      — Create session
POST   /api/v1/sessions/{sessionId}/memory   — Add memory
GET    /api/v1/sessions/{sessionId}/memory   — Get memory + facts
POST   /api/v1/sessions/{sessionId}/search   — Semantic search
GET    /healthz                              — Health check
```

**Important:** Zep CE 0.25 uses **singular** `/api/v1/user`, NOT plural `/api/v1/users`.

### Graceful Degradation

If Zep is unavailable, the memory service falls back to:
- No cross-session facts (Tier 3 empty)
- Longitudinal memory from DB only (Tier 4 partial)
- No impact on Tier 1 (working) or Tier 4 (AIB)

---

## 5. Phase 4: LangGraph Orchestrator + 5 Agents

**Goal:** Build the LangGraph supervisor graph with 5 specialized agent subgraphs, 40+ tools, and write action confirmations.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Supervisor | `ai-service/app/graph/supervisor.py` | 237 | 8-node StateGraph with conditional routing |
| Pre-router | `ai-service/app/graph/nodes/pre_router.py` | 131 | 3-layer classifier + 5-way agent router |
| Agent dispatch | `ai-service/app/graph/nodes/agent_dispatch.py` | 336 | Agentic tool-calling loop (max 5 iterations) |
| Validate | `ai-service/app/graph/nodes/validate.py` | 210 | 4-layer guardrails (PHV hard gate) |
| Format response | `ai-service/app/graph/nodes/format_response.py` | 245 | JSON → structured card types |
| Agent router | `ai-service/app/agents/router.py` | 251 | 5-way routing with tab affinity |
| Intent classifier | `ai-service/app/agents/intent_classifier.py` | 391 | 3-layer: exact match → Haiku → fallthrough |
| Intent registry | `ai-service/app/agents/intent_registry.py` | 547 | 43+ intent definitions |
| Prompt builder | `ai-service/app/agents/prompt_builder.py` | 492 | 2-block system prompt (static + dynamic) |
| Tool registry | `ai-service/app/agents/tools/__init__.py` | 95 | Agent → tool factory mapping |
| Tool bridge | `ai-service/app/agents/tools/bridge.py` | 182 | HTTP bridge to TS backend for writes |
| Output tools | `ai-service/app/agents/tools/output_tools.py` | 741 | 20 tools: readiness, benchmarks, drills, programs |
| Timeline tools | `ai-service/app/agents/tools/timeline_tools.py` | 271 | 6 tools: calendar CRUD, load collision |
| Mastery tools | `ai-service/app/agents/tools/mastery_tools.py` | 288 | 7 tools: career, CV, achievements, trajectory |
| Settings tools | `ai-service/app/agents/tools/settings_tools.py` | 520 | 18 tools: goals, injury, nutrition, profile, wearable |
| Planning tools | `ai-service/app/agents/tools/planning_tools.py` | 221 | 5 tools: planning context, mode changes |
| Card models | `ai-service/app/models/cards.py` | 227 | 12 card types (Pydantic) |

### LangGraph Supervisor Flow

```
START
  ↓
context_assembly_node (11 parallel queries, <800ms)
  ↓
rag_retrieval_node (5-signal hybrid search)
  ↓
pre_router_node (3-layer classifier + 5-way router)
  ↓
┌─ capsule? ──→ format_response_node → persist_node → END
│
├─ confirm? ──→ execute_confirmed_node → format_response_node → persist_node → END
│
└─ AI ────────→ agent_dispatch_node (agentic loop, 0-5 tool calls)
                  ↓
                validate_node (PHV safety, content safety, format, quality)
                  ↓
                format_response_node (JSON → structured cards)
                  ↓
                persist_node (Zep save, memory extraction)
                  ↓
                END
```

### 3-Layer Intent Classification

```
Layer 1: Exact Match ($0, 0ms)
  └── 150+ chip action patterns (e.g., "log_check_in", "show_schedule")
  └── Maps directly to capsule actions — no LLM needed

Layer 2: Haiku AI Classifier (~$0.0001, ~200ms)
  └── 43 intent definitions with context boosts
  └── Returns: intent_id, confidence, agent_type
  └── Threshold: confidence ≥ 0.7 for capsule, else fallthrough

Layer 3: Fallthrough to Full AI
  └── Complex/ambiguous queries → full agent_dispatch with tools
  └── 16 fallthrough prefixes force this path
```

### 5-Way Agent Router

| Agent | Tools | Owns |
|---|---|---|
| **Output** | 20 | Readiness, vitals, check-ins, benchmarks, drills, programs |
| **Timeline** | 6 | Calendar events, scheduling, load collision |
| **Mastery** | 7 | Career, CV, achievements, test trajectory, consistency |
| **Settings** | 18 | Goals, injury, nutrition, profile, wearables, navigation |
| **Planning** | 5 | Mode changes, planning context, protocol details |

### Write Action Confirmation Flow

```
1. Agent proposes write → PendingWriteAction stored in state
2. Response includes pendingConfirmation with preview
3. Mobile shows ConfirmationCard (approve/reject)
4. User approves → POST with confirmedAction
5. execute_confirmed_node bridges to TS event pipeline
6. Event pipeline: emitEventSafe() → processEvent() → writeSnapshot()
```

### 2-Block System Prompt

```
Block 1 — Static (cacheable, ~2500 tokens):
  ├── Identity: "You are Tomo, an AI performance coach for young athletes"
  ├── Guardrails: What to never do (medical, politics, gambling, etc.)
  ├── Gen Z rules: Headline first, max 2 sentences, emoji anchors
  ├── Card format instructions
  └── Agent-specific behavior (output/timeline/mastery/settings/planning)

Block 2 — Dynamic (per-request, ~2000-4000 tokens):
  ├── Athlete profile (name, sport, position, age band)
  ├── Today's readiness (score, components, RAG flag)
  ├── Snapshot enrichment (ACWR, load, HRV, trends)
  ├── AIB summary (6 sections)
  ├── Active recommendations
  ├── Today's schedule
  ├── Upcoming exams
  ├── Planning context (mode, protocols)
  ├── Cross-session memory (Zep facts)
  ├── Longitudinal memory (goals, concerns, preferences)
  ├── RAG knowledge context
  ├── Temporal context (time of day, match day, exam proximity)
  └── Schedule rules + mode config
```

### 4-Layer Validation (validate_node)

```
Layer 1: PHV Safety (HARD GATE)
  └── Blocks contraindicated exercises for mid-PHV athletes
  └── Replaces response with safe alternative + citations
  └── MUST be 100% — eval gate blocks deploy if <1.0

Layer 2: Content Safety
  └── Self-harm → compassionate redirect with crisis hotlines
  └── Medical diagnosis → redirect to healthcare provider
  └── Off-topic (politics, gambling, etc.) → warm redirect

Layer 3: Format Validation
  └── Ensures response is parseable JSON with valid card types
  └── Falls back to text_card if JSON extraction fails

Layer 4: Quality Check (advisory, logged)
  └── Verbose response flag
  └── Plain text response flag (should be structured)
  └── Logged to LangSmith for monitoring
```

---

## 6. Phase 5: PropertyGraphIndex RAG

**Goal:** Build hybrid retrieval with 5 signals, knowledge graph with 7 entity types and 10 relationship types, plus Cohere reranking.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Embedder | `ai-service/app/rag/embedder.py` | 145 | Voyage AI voyage-3-lite (512-dim) |
| Graph store | `ai-service/app/rag/graph_store.py` | 514 | PostgreSQL knowledge graph CRUD + traversal |
| Retriever | `ai-service/app/rag/retriever.py` | 374 | 5-signal hybrid retrieval pipeline |
| Reranker | `ai-service/app/rag/reranker.py` | 205 | Cohere rerank-v3.5 + state-aware boosting |
| Sub-question | `ai-service/app/rag/sub_question.py` | 156 | Haiku query decomposition |
| RAG models | `ai-service/app/rag/models.py` | 144 | RetrievalResult, RankedResult, GraphRAGContext |
| RAG node | `ai-service/app/graph/nodes/rag_retrieval.py` | 103 | LangGraph integration node |
| Seed script | `ai-service/scripts/seed_knowledge_graph.py` | 619 | 83 entities, 130 relationships |
| Expansion script | `ai-service/scripts/seed_knowledge_expansion.py` | 1249 | 100+ entities, 291 relationships |
| Migration 040 | `backend/supabase/migrations/...040...` | ~100 | knowledge_entities + knowledge_relationships |

### 5-Signal Hybrid Retrieval

```
Query: "Is it safe for a mid-PHV athlete to do depth jumps?"
                    ↓
┌──────────── 5 Parallel Signals ─────────────┐
│                                              │
│  1. Vector Search (entities)                 │
│     └── Voyage embed query → cosine sim      │
│                                              │
│  2. Vector Search (chunks)                   │
│     └── rag_knowledge_chunks.embedding       │
│                                              │
│  3. Full-Text Search (entities)              │
│     └── tsvector + ts_rank_cd                │
│                                              │
│  4. BM25 Search (chunks)                     │
│     └── ts_rank_cd on chunk content          │
│                                              │
│  5. Graph Traversal                          │
│     └── 1-hop: depth_jumps → CONTRAINDICATED │
│     └── 2-hop: depth_jumps → SAFE_ALT → X   │
│                                              │
└──────────────────────────────────────────────┘
                    ↓
            Deduplicate + Merge
                    ↓
         Cohere Rerank v3.5 (semantic)
                    ↓
         State-Aware Boosting:
           PHV stage match → 1.5x
           Sport match → 1.3x
           Injury relevance → 1.4x
           Readiness match → 1.2x
                    ↓
         Top 4 chunks → prompt injection (~600 tokens)
```

### Knowledge Graph Schema

**7 Entity Types:**
- `concept` — Sports science concepts (periodization, load management, etc.)
- `condition` — Medical/developmental conditions (PHV, knee pain, etc.)
- `exercise` — Training exercises (depth jumps, squats, etc.)
- `protocol` — PD protocols (PHV safety, ACWR management, etc.)
- `sport` — Sports (football, padel, tennis, etc.)
- `body_region` — Anatomical regions (knee, ankle, shoulder, etc.)
- `age_group` — Age bands (U13, U15, U17, U19+)

**10 Relationship Types:**
- `CONTRAINDICATED_FOR` — Exercise unsafe for condition
- `SAFE_ALTERNATIVE_TO` — Safe replacement exercise
- `PREREQUISITE_FOR` — Must master before attempting
- `TRAINS` — Exercise develops attribute
- `PREVENTS` — Exercise prevents injury
- `MEASURES` — Test measures attribute
- `REQUIRES` — Protocol requires condition
- `PART_OF` — Sub-component relationship
- `RELATED_TO` — General association
- `APPLIES_TO` — Protocol applies to entity

### Sub-Question Decomposition

For complex queries, Haiku breaks them into 2-3 sub-questions:

```
Input: "What exercises are safe for a mid-PHV athlete with knee pain?"
Output:
  Q1: "What exercises are contraindicated during mid-PHV?"
  Q2: "What exercises are contraindicated for knee pain?"
  Q3: "What are safe alternative exercises for mid-PHV athletes?"
```

Each sub-question is searched independently, results merged and reranked.

---

## 7. Phase 6: Eval Suite + Deploy Gate

**Goal:** 250+ eval scenarios across 8 suites, 6 evaluators, and a CI/CD deploy gate that blocks on PHV safety regression.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Eval scenarios | `ai-service/scripts/eval_scenarios.py` | 790 | Scenario definitions + test runner |
| Eval suite | `ai-service/scripts/eval_suite.py` | 586 | Aggregation, metrics, reporting |
| RAG quality | `ai-service/scripts/eval_rag_quality.py` | 337 | RAGAS-based retrieval evaluation |
| Eval evaluators | `ai-service/scripts/eval_evaluators.py` | 505 | Meta-evaluation calibration |

### 8 Eval Suites

| Suite | Focus | Scenarios |
|---|---|---|
| S1 | Core Routing | Intent → correct agent mapping |
| S2 | Sport Context | Sport-specific coaching accuracy |
| S3 | Age Tone | U13/U15/U17/U19+ communication |
| S4 | PHV Safety | **Hard gate — 100% required** |
| S5 | Recovery | Readiness-aware recommendations |
| S6 | Recommendations | Drill/program personalization |
| S7 | Edge Cases | Ambiguous queries, multi-intent |
| S8 | Multi-turn | Conversation continuity |

### 6 Evaluators

1. **phv_safety** — HARD GATE: contraindicated exercises never recommended for mid-PHV. **Must be 1.0.**
2. **coaching_specificity** — Sport + position context in every response
3. **protocol_citation** — References PD protocols when applicable
4. **context_continuity** — Maintains conversation state across turns
5. **routing_accuracy** — Correct agent selected for intent
6. **card_format_validation** — Valid JSON card structure

### Deploy Gate

```
CI/CD Pipeline:
  1. Run eval suite against staging
  2. Check results:
     - phv_safety < 1.0 → BLOCK DEPLOY ❌
     - Any critical evaluator regresses > 5% → BLOCK DEPLOY ❌
     - All pass → DEPLOY ✅
  3. Results pushed to LangSmith as labeled dataset
```

### Production Eval Report (April 3, 2026)

```
Overall: 82% pass rate
PHV Safety: 100% ✅
Routing Accuracy: 89%
Sport Context: 78%
Total Cost: $0.06
```

---

## 8. Phase 7: Multi-Tenant B2B Foundation

**Goal:** Database schema for multi-tenant organizations, knowledge hierarchy, and protocol inheritance.

### What Was Built

| Component | File | Lines | Purpose |
|---|---|---|---|
| Tenant models | `ai-service/app/models/tenant.py` | 268 | Tenant, Membership, Inheritance models |
| Tenant service | `ai-service/app/services/tenant_service.py` | 567 | CRUD, roles, hierarchy resolution |
| Knowledge resolver | `ai-service/app/services/knowledge_resolver.py` | 269 | Protocol/knowledge inheritance chain |
| Tenant routes | `ai-service/app/routes/tenants.py` | 324 | CRUD, membership, inheritance APIs |

### Tenant Hierarchy

```
Global (Tomo platform)
  ├── Institution A (e.g., "Ajax Academy")
  │     ├── Group A1 (e.g., "U17 Squad")
  │     └── Group A2 (e.g., "U15 Squad")
  ├── Institution B (e.g., "Barcelona La Masia")
  │     └── Group B1
  └── Institution C
```

### Protocol Inheritance Resolution

```
Resolution Order: Individual > Group > Institution > Global

Override Types:
  - INHERIT: Use parent's protocol as-is
  - EXTEND: Add conditions/outputs to parent's protocol
  - OVERRIDE: Replace parent's protocol entirely
  - BLOCK: Disable parent's protocol at this tier

Exception: MANDATORY protocols (safety_critical=true) CANNOT be overridden or blocked.
```

### Database Tables

```sql
cms_tenants (id, name, slug, tier, parent_id, config, subscription_tier, max_athletes, ...)
organization_memberships (user_id, org_id, role, ...)
cms_knowledge_inheritance (tenant_id, knowledge_type, knowledge_id, override_type, ...)
```

### RBAC Roles

| Role | Level | Access |
|---|---|---|
| super_admin | 0 | All pages, all orgs, global protocols |
| institutional_pd | 1 | Knowledge, protocols, evals — org-scoped |
| coach | 2 | Training content only (drills, programs, assessments) |
| analyst | 3 | Read-only dashboards |
| athlete | 4 | No CMS access |

---

## 9. Phase 8: Enterprise CMS Rebuild

**Goal:** Replace the old 89-page admin panel with an enterprise-grade multi-tenant CMS.

### What Was Built

The old admin panel (89 pages, 88 API routes, 22 services, 60+ components) was:
- **46 old-only pages deleted** (13,540 lines removed)
- **14 CRUD modules kept** (drills, programs, assessments, sports, etc.) under enterprise layout
- **13 new enterprise pages built** (organizations, knowledge ops, protocol builder, etc.)
- **Layout unified** — single `EnterpriseSidebar` + `EnterpriseHeader` with RBAC

### CMS Navigation (11 groups, 56 total pages)

```
Overview (all roles)
  └── Dashboard

Organization (super_admin)
  ├── Organizations List / Detail
  └── Onboarding Wizard

Knowledge Operations (institutional_pd)
  ├── Knowledge Base
  ├── Knowledge Editor (Tiptap)
  └── Knowledge Graph (React Flow)

Performance Director (institutional_pd)
  ├── Protocols List
  ├── Protocol Builder (React Flow)
  ├── Protocol Inheritance Tree
  └── Protocol Simulator

Training Content (coach)
  ├── Drills (list / new / edit)
  ├── Programs (list / new / edit)
  ├── Assessments (list / new / edit)
  ├── Normative Data Browser
  └── Mastery Pillars

Sport Configuration (institutional_pd)
  └── Sports → Attributes / Positions / Skills / Rating Levels

Planning Intelligence (institutional_pd)
  ├── Athlete Modes
  ├── Planning Protocols
  └── Cognitive Windows

AI Evaluation (institutional_pd)
  ├── Eval Dashboard
  └── Conversation Browser

AI & Recommendations (institutional_pd)
  ├── Performance Intelligence Hub
  └── ACWR Inspector

Notifications (institutional_pd)
  ├── Templates
  └── Scheduled Jobs

App Design (super_admin)
  └── Feature Flags
```

### Key Enterprise Components

| Component | File | Lines | Tech |
|---|---|---|---|
| Enterprise Sidebar | `components/admin/EnterpriseSidebar.tsx` | 231 | Role-based nav filtering |
| Enterprise Header | `components/admin/EnterpriseHeader.tsx` | ~200 | Tenant switcher, user menu |
| Dashboard Layout | `app/admin/(dashboard)/layout.tsx` | 70 | Enterprise RBAC wrapper |
| Bulk Import/Export | `components/admin/enterprise/BulkImportExport.tsx` | 316 | JSON/CSV import with preview |

---

## 10. Phase 9: Shadow Mode + Cutover

**Goal:** Run both TS and Python AI services simultaneously, compare via LangSmith, then cut over to Python.

### Shadow Mode Flow

```
1. AI_SERVICE_ENABLED="shadow"
2. Every non-capsule chat request:
   a. TypeScript orchestrator processes (user-facing response)
   b. Python AI service processes (background, fire-and-forget)
   c. Both results traced to LangSmith for comparison
3. Compare: agent routing, tool calls, response quality, cost
4. 48-72h parity confirmed
5. AI_SERVICE_ENABLED="true", AI_SERVICE_PERCENTAGE=10 → 50 → 100
```

### Code Cleanup After Cutover

The following TypeScript AI code was archived to git branch then paths cleared:

| Category | Files | Lines | Python Replacement |
|---|---|---|---|
| Agent orchestrator | `orchestrator.ts` | 1,684 | LangGraph supervisor |
| Intent handlers | `intentHandlers.ts` | 1,867 | Capsule fast-path stays in TS |
| Intent registry | `intentRegistry.ts` | 761 | Python intent_registry.py |
| Intent classifier | `intentClassifier.ts` | 622 | Python intent_classifier.py |
| Output agent | `outputAgent.ts` | 1,471 | Python output_tools.py |
| Timeline agent | `timelineAgent.ts` | 1,132 | Python timeline_tools.py |
| Settings agent | `settingsAgent.ts` | 804 | Python settings_tools.py |
| Planning agent | `planningAgent.ts` | 634 | Python planning_tools.py |
| Mastery agent | `masteryAgent.ts` | 441 | Python mastery_tools.py |
| Response formatter | `responseFormatter.ts` | 837 | Python format_response.py |
| Context builder | `contextBuilder.ts` | 734 | Python context_assembly.py |
| Session service | `sessionService.ts` | 561 | LangGraph state + Zep |
| Chat guardrails | `chatGuardrails.ts` | 511 | Python validate.py |
| RAG retriever | `rag/ragRetriever.ts` | 125 | Python retriever.py |
| RAG generator | `rag/ragGenerator.ts` | 220 | Python graph_store.py |
| RAG embedder | `rag/embedder.ts` | 74 | Python embedder.py |
| **Total** | **27+ files** | **~15,000** | — |

### What Stays in TypeScript

- Boot endpoint (`/api/v1/boot` — 18 queries, zero AI)
- Event pipeline (30 types, 11 handlers, snapshot writer)
- Capsule fast-path (direct tool execution, $0)
- Planning services (6 pure functions, consumed by Python via bridge)
- Scheduling services (rules, mode config)
- PDIL services (protocol evaluation)
- Snapshot services (enrichment, trends, confidence)
- Recommendation computers (9 computers, minus RAG)
- Notification services
- `trackedClaudeCall.ts` (CV generation, non-chat)
- Auth, rate limiting
- Enterprise CMS

---

## 11. Phase 10: CMS Visual Builder + Polish

**Goal:** Build advanced visual tools (React Flow, Tiptap) and remaining CMS pages.

### What Was Built

| Page | Route | Lines | Tech |
|---|---|---|---|
| Protocol Builder | `/admin/enterprise/protocols/builder` | 1,319 | React Flow (3 custom nodes) |
| Protocol Simulator | `/admin/enterprise/protocols/test` | 898 | Client-side condition evaluator |
| Knowledge Editor | `/admin/enterprise/knowledge/editor` | 768 | Tiptap rich text editor |
| Knowledge Graph | `/admin/enterprise/knowledge/graph` | 779 | React Flow visualization |
| Conversation Browser | `/admin/enterprise/evaluations/conversations` | 733 | Two-panel annotation interface |
| Protocol Inheritance | `/admin/enterprise/protocols/inheritance` | 495 | Recursive tree + resolution view |
| Onboarding Wizard | `/admin/enterprise/onboarding` | 771 | 5-step guided flow |
| Bulk Import/Export | `components/admin/enterprise/BulkImportExport.tsx` | 316 | JSON/CSV with preview |
| Protocol Builder API | `api/v1/admin/enterprise/protocols/builder/route.ts` | 518 | Full CRUD + immutability guards |

### Protocol Builder (React Flow)

```
3 Custom Node Types:
  1. ConditionGroupNode — match: ALL/ANY, conditions array
  2. ActionNode — output domain selection + values
  3. OutputNode — resolved combined output preview

Condition DSL:
  {
    "match": "all",
    "conditions": [
      { "field": "readiness_flag", "operator": "eq", "value": "RED" },
      { "field": "acwr", "operator": "gte", "value": 1.5 }
    ]
  }
```

### Protocol Simulator (5 Presets)

| Preset | Readiness | ACWR | PHV | Key Test |
|---|---|---|---|---|
| Healthy Green | GREEN | 1.1 | post_phv | Baseline — minimal protocols fire |
| Red Overloaded | RED | 1.6 | post_phv | Maximum restriction |
| Mid-PHV Amber | AMBER | 1.0 | mid_phv | PHV safety protocols fire |
| Post-Match Recovery | AMBER | 1.2 | post_phv | Recovery protocols |
| Exam Period | GREEN | 0.9 | post_phv | Academic load protocols |

Output resolution: `intensity_cap` = most restrictive, `load_multiplier` = MIN, `contraindications` = UNION.

### Knowledge Editor (Tiptap)

- StarterKit + Link + Placeholder + Highlight + Typography extensions
- Evidence citation dialog (source, URL, grade A/B/C/D, year)
- Domain/PHV/age/sport scope selectors
- Auto-embedding via Voyage AI on save
- Version history

---

## 12. Database Schema

### Migrations 030-038 (Enterprise AI Core)

| Migration | Table(s) | Purpose |
|---|---|---|
| 030 | `pd_protocols`, `pd_protocol_audit` | PDIL rules + execution audit |
| 031 | (seeds) | 10 built-in safety protocols (immutable) |
| 032 | `athlete_daily_vitals`, `athlete_benchmark_cache`, `athlete_weekly_digest`, `athlete_monthly_summary` | Unified data layer |
| 033 | (seeds) | 14 extended protocols (academic, load, wellness) |
| 034 | `pd_signals` | Dashboard signal system (8 built-in) |
| 035 | `pd_program_rules`, `pd_program_rule_audit` | Training program assignment rules |
| 036 | `athlete_modes`, `training_category_templates`, `planning_protocols`, `cognitive_windows`, `dual_load_thresholds`, `athlete_subjects`, `planning_sessions`, `athlete_mode_history` | Planning intelligence |
| 037 | (alters `athlete_snapshots`) | 360-degree expansion: 44 → 107 fields |
| 038 | `wearable_connections` | OAuth token storage for WHOOP/Garmin |

### Key Table: `pd_protocols`

```sql
CREATE TABLE pd_protocols (
  protocol_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,  -- safety | development | recovery | performance | academic
  conditions JSONB NOT NULL DEFAULT '{}',  -- Condition DSL
  priority INT NOT NULL DEFAULT 50,
  -- Output Domain 1: Training Modifiers
  load_multiplier NUMERIC(3,2),
  intensity_cap TEXT,  -- REST | LIGHT | MODERATE | HARD | MAX
  contraindications TEXT[],
  required_elements TEXT[],
  session_cap_minutes INT,
  -- Output Domain 2: Recommendation Guardrails
  blocked_rec_categories TEXT[],
  mandatory_rec_categories TEXT[],
  priority_override TEXT,
  override_message TEXT,
  -- Output Domain 3: RAG Overrides
  forced_rag_domains TEXT[],
  blocked_rag_domains TEXT[],
  rag_condition_tags TEXT[],
  -- Output Domain 4: AI Coaching Context
  ai_system_injection TEXT,
  safety_critical BOOLEAN DEFAULT FALSE,
  -- Scope Filters
  sport_filter TEXT[],
  phv_filter TEXT[],
  age_band_filter TEXT[],
  position_filter TEXT[],
  -- Metadata
  is_built_in BOOLEAN DEFAULT FALSE,
  is_enabled BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  evidence_source TEXT,
  evidence_grade TEXT  -- A | B | C | D
);
```

### Key Table: `athlete_snapshots` (107 fields after migration 037)

Major field blocks:
- Core: readiness, ACWR, ATL/CTL, PHV stage, injury risk
- Vitals: HRV, sleep, SpO2, recovery score, skin temp
- Performance Science: training monotony, strain, data confidence
- Trends: 7-day HRV/load/readiness/sleep/body-feel trends
- Schedule: matches next 7d, exams next 14d, sessions scheduled
- Engagement: chat usage, rec action rate, program compliance
- Triangle: coach/parent interaction scores
- Academic: study hours, exam count, stress
- CV: views, completeness, statement status
- Wearable: connected status, last sync

---

## 13. Infrastructure & Deployment

### Railway Services

| Service | Tech | Port | Internal URL |
|---|---|---|---|
| tomo-app | Next.js 16 | 8080 | `tomo-app.railway.internal:8080` |
| tomo-ai | FastAPI/Python | 8000 | `tomo-ai.railway.internal:8000` |
| tomo-zep | Zep CE 0.25 | 8080 | `tomo-zep.railway.internal:8080` |

- **Internal networking**: <5ms latency between services (Railway private network)
- **Auto-deploy**: `git push origin main` → Railway auto-deploys changed services
- **Public URL**: `https://app.my-tomo.com` (custom domain via CNAME)

### Required Environment Variables

**tomo-app (TypeScript):**
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY, VOYAGE_API_KEY, GEMINI_API_KEY
AI_SERVICE_ENABLED=true, AI_SERVICE_PERCENTAGE=100
AI_SERVICE_URL=http://tomo-ai.railway.internal:8000
```

**tomo-ai (Python):**
```
ANTHROPIC_API_KEY, VOYAGE_API_KEY, COHERE_API_KEY
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
ZEP_BASE_URL=http://tomo-zep.railway.internal:8080
ZEP_API_KEY=[secret]
LANGCHAIN_TRACING_V2=true, LANGCHAIN_PROJECT=tomo-ai-production
LANGCHAIN_API_KEY, LANGCHAIN_ENDPOINT=https://eu.api.smith.langchain.com
TS_BACKEND_URL=http://tomo-app.railway.internal:8080
```

**tomo-zep (Zep CE):**
```
ZEP_STORE_POSTGRES_DSN=postgres://...@...:6543/postgres
ZEP_AUTH_SECRET=[32+ chars]
ZEP_OPENAI_API_KEY=sk-...
ZEP_LOG_LEVEL=info
```

---

## 14. File Inventory

### Python AI Service (~16,000 lines)

```
ai-service/
├── app/
│   ├── main.py                     (93)   FastAPI entry point
│   ├── config.py                   (64)   Pydantic Settings
│   ├── db/
│   │   └── supabase.py             (118)  psycopg3 pool
│   ├── models/
│   │   ├── state.py                (82)   TomoChatState
│   │   ├── context.py              (266)  PlayerContext
│   │   ├── cards.py                (227)  12 card types
│   │   └── tenant.py               (268)  Multi-tenant models
│   ├── routes/
│   │   ├── health.py               (31)   Health checks
│   │   ├── chat.py                 (223)  SSE + sync chat
│   │   ├── aib.py                  (176)  AIB endpoints
│   │   └── tenants.py              (324)  Tenant CRUD
│   ├── graph/
│   │   ├── supervisor.py           (237)  LangGraph orchestrator
│   │   └── nodes/
│   │       ├── context_assembly.py (924)  11 parallel queries
│   │       ├── rag_retrieval.py    (103)  Hybrid RAG search
│   │       ├── pre_router.py       (131)  Intent → agent routing
│   │       ├── agent_dispatch.py   (336)  Agentic tool loop
│   │       ├── validate.py         (210)  4-layer guardrails
│   │       ├── format_response.py  (245)  JSON → cards
│   │       ├── persist.py          (125)  Zep + memory
│   │       └── aib_generator.py    (364)  Haiku AIB gen
│   ├── agents/
│   │   ├── router.py               (251)  5-way routing
│   │   ├── intent_classifier.py    (391)  3-layer classification
│   │   ├── intent_registry.py      (547)  43+ intents
│   │   ├── prompt_builder.py       (492)  2-block prompts
│   │   └── tools/
│   │       ├── __init__.py          (95)   Tool registry
│   │       ├── bridge.py            (182)  TS backend bridge
│   │       ├── output_tools.py      (741)  20 tools
│   │       ├── timeline_tools.py    (271)  6 tools
│   │       ├── mastery_tools.py     (288)  7 tools
│   │       ├── settings_tools.py    (520)  18 tools
│   │       └── planning_tools.py    (221)  5 tools
│   ├── services/
│   │   ├── memory_service.py        (410)  4-tier memory
│   │   ├── zep_client.py            (383)  Zep CE client
│   │   ├── knowledge_resolver.py    (269)  Hierarchy resolution
│   │   └── tenant_service.py        (567)  Tenant management
│   └── rag/
│       ├── embedder.py              (145)  Voyage AI
│       ├── graph_store.py           (514)  Knowledge graph
│       ├── retriever.py             (374)  5-signal retrieval
│       ├── reranker.py              (205)  Cohere + boost
│       ├── sub_question.py          (156)  Query decomposition
│       └── models.py                (144)  RAG data models
├── scripts/
│   ├── seed_knowledge_graph.py      (619)
│   ├── seed_knowledge_expansion.py  (1249)
│   ├── eval_scenarios.py            (790)
│   ├── eval_suite.py                (586)
│   ├── eval_rag_quality.py          (337)
│   ├── eval_evaluators.py           (505)
│   └── backfill_zep_memory.py       (181)
├── requirements.txt                 (41)
├── Dockerfile                       (~20)
├── Procfile                         (1)
└── runtime.txt                      (1)
```

### TypeScript Integration (~600 lines)

```
backend/
├── services/agents/
│   └── aiServiceProxy.ts           (333)  Stream/sync/shadow proxy
└── app/api/v1/chat/
    ├── agent/route.ts               (244)  Main chat route + capsule
    └── agent-stream/route.ts        (~150) SSE-only streaming
```

### Zep Service (~130 lines)

```
zep-service/
├── Dockerfile                       (23)
├── start.sh                         (93)
├── init.sql                         (~10)
├── railway.toml                     (8)
└── .env.example                     (~5)
```

---

## 15. Cost Model

### Per-Request Costs

| Component | Cost | When |
|---|---|---|
| Capsule fast-path | $0.000 | 60-70% of chat (direct tool execution) |
| Haiku classifier | $0.0001 | Layer 2 intent classification |
| Voyage embedding | $0.000001 | RAG query embedding (12 tokens) |
| Cohere rerank | $0.002 | Reranking retrieval results |
| Haiku sub-question | $0.0001 | Complex query decomposition |
| Haiku agent dispatch | $0.003-0.008 | Main AI response generation |
| **Typical AI request** | **~$0.005-0.010** | — |

### Background Costs

| Component | Cost | Frequency |
|---|---|---|
| AIB generation | $0.003 | Per snapshot change + lazy fallback |
| Memory extraction | $0.001 | After 5+ conversation turns |
| Zep CE (OpenAI) | ~$0.001 | Entity extraction per session |

### Monthly at 50K MAU

| Item | Monthly Cost |
|---|---|
| Railway — TypeScript | $20-40 |
| Railway — Python AI | $20-40 |
| Railway — Zep CE | $5-10 |
| Supabase Pro | $25 |
| Anthropic API | ~$3,500 |
| Voyage AI | ~$50 |
| Cohere Rerank | ~$20 |
| LangSmith | $0-39 |
| OpenAI (Zep) | ~$5 |
| **Total** | **~$3,650-3,730/mo** |

---

## 16. Data Flow Diagrams

### Chat Message Flow

```
Mobile App
  │ POST /api/v1/chat/agent?stream=true
  ▼
TS Backend (Next.js)
  │ Auth → Rate limit → Pre-flight guardrail
  │
  ├── Capsule? → Execute tool → SSE done → Mobile
  │
  └── Non-capsule → Proxy to Python
                      │
                      ▼
                   Python AI Service
                      │
                   context_assembly_node
                      │ 11 parallel DB queries
                      │ PlayerContext built
                      ▼
                   rag_retrieval_node
                      │ 5-signal hybrid search
                      │ Cohere rerank + state boost
                      ▼
                   pre_router_node
                      │ 3-layer classifier
                      │ 5-way agent router
                      ▼
                   agent_dispatch_node
                      │ Haiku 4.5 + tools (0-5 iterations)
                      │ Write actions → PendingWriteAction
                      ▼
                   validate_node
                      │ PHV safety (hard gate)
                      │ Content safety
                      │ Format validation
                      ▼
                   format_response_node
                      │ JSON → structured cards
                      ▼
                   persist_node
                      │ Zep session save
                      │ Longitudinal memory extraction
                      ▼
                   SSE: event:done → TS proxy → Mobile
```

### Protocol Evaluation Chain

```
Athlete State (from snapshot)
  │
  ▼
PDIL Evaluator
  │ For each pd_protocol (ordered by priority):
  │   1. Scope filter (sport, PHV, age, position)
  │   2. Condition DSL evaluation against snapshot
  │   3. If match → collect output domains
  │
  ▼
Resolved Output (aggregated):
  │ intensity_cap = most restrictive
  │ load_multiplier = MIN across all
  │ contraindications = UNION
  │ blocked_categories = UNION
  │ ai_system_injection = CONCAT
  │
  ▼
Consumers:
  ├── AI Chat (system prompt injection)
  ├── Recommendation Engine (guardrails)
  ├── Dashboard (signals + pills)
  └── Planning Engine (plan generation constraints)
```

### Knowledge Hierarchy

```
Global (Tomo platform)
  │ MANDATORY protocols (immutable)
  │ Sports science knowledge (24+ chunks)
  │
  ▼
Institution (e.g., Ajax Academy)
  │ Can: INHERIT, EXTEND, or OVERRIDE non-mandatory
  │ Can: Add institution-specific knowledge
  │ Cannot: BLOCK or OVERRIDE mandatory
  │
  ▼
Group (e.g., U17 Squad)
  │ Further refinement
  │
  ▼
Individual Athlete
  │ Finest granularity
  │
  Resolution: Individual > Group > Institution > Global
```

---

## Appendix: Key Fixes and Gotchas

### Known Issues Resolved

1. **Cohere model name**: `rerank-english-v3.5` renamed to `rerank-v3.5` (Cohere dropped "english" prefix)
2. **psycopg3 API**: Uses `pool.connection()` not `pool.acquire()`, `conn.execute()` + `fetchall()` not `conn.fetch()`
3. **Zep CE 0.25 paths**: Uses singular `/api/v1/user` not plural `/api/v1/users`
4. **Mobile SSE parser**: Required `lineBuffer` for partial line handling across XHR chunks
5. **base-ui/react Dialog**: Uses `render` prop not Radix's `asChild`
6. **base-ui/react Select**: `onValueChange` passes `string | null` not just `string`

### Critical Safety Rules

- PHV safety eval must be **100%** — deploy gate blocks on any regression
- MANDATORY protocols are **immutable** at all tenant tiers
- `safety_critical=true` protocols use **Sonnet** (never Haiku)
- `enforcePHVSafety()` is a **post-response filter** that appends warnings even if the agent missed them
- Pain reported → **always cap to LIGHT**, override message: "Talk to your coach or physio"

### Performance Targets

- Context assembly: **< 800ms**
- Total chat response: **< 6s** (including agent + tools)
- Capsule fast-path: **< 200ms** (no LLM)
- RAG retrieval: **< 500ms** (including embedding + search + rerank)
- Boot endpoint: **< 2s** (18 parallel queries)
