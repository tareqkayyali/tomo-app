# Tomo AI Architecture — Complete Export

> **Version**: 1.0 — April 12, 2026
> **Purpose**: Self-contained reference for studying the Tomo AI system and planning specialized agents
> **Audience**: Architecture review, agent design planning

---

## Table of Contents

1. [System Overview & Tech Stack](#1-system-overview--tech-stack)
2. [Complete Message Flow](#2-complete-message-flow)
3. [LangGraph Supervisor (Python AI Service)](#3-langgraph-supervisor)
4. [3-Layer Intent Classification](#4-3-layer-intent-classification)
5. [Complete Intent Registry (45 Intents)](#5-complete-intent-registry)
6. [Agent System & All Tools](#6-agent-system--all-tools)
7. [Context Builder (PlayerContext)](#7-context-builder)
8. [System Prompt Architecture](#8-system-prompt-architecture)
9. [Capsule Components (30 Interactive Cards)](#9-capsule-components)
10. [Visual Card Types (15 Display Cards)](#10-visual-card-types)
11. [Safety & Guardrails](#11-safety--guardrails)
12. [RAG Knowledge System](#12-rag-knowledge-system)
13. [4-Tier Athlete Memory](#13-4-tier-athlete-memory)
14. [Recommendation Intelligence Engine](#14-recommendation-intelligence-engine)
15. [Schedule Rule Engine](#15-schedule-rule-engine)
16. [Event Pipeline & Snapshot](#16-event-pipeline--snapshot)
17. [Session Management](#17-session-management)
18. [Cost Architecture](#18-cost-architecture)
19. [Complete File Reference](#19-complete-file-reference)
20. [Extension Points for New Agents](#20-extension-points-for-new-agents)

---

## 1. System Overview & Tech Stack

Tomo is an AI coaching platform for young athletes (ages 13–25) built on a **5-Layer Athlete Data Fabric**. Every piece of athlete data flows through an immutable event stream, gets pre-computed into a denormalized snapshot, triggers intelligent recommendations, and feeds multi-agent AI coaching.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Expo/RN)                      │
│  Timeline │ Output │ Tomo Chat │ Mastery │ Own It            │
└─────────┬───────────────────────────────────────────────────┘
          │  REST API + SSE Streaming + Supabase Realtime
┌─────────▼───────────────────────────────────────────────────┐
│          TYPESCRIPT BACKEND (Next.js 16 / Railway)           │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Boot    │  │  Chat    │  │ Schedule │  │  Admin     │  │
│  │ Endpoint │  │ Routes   │  │  Engine  │  │  Panel     │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬───────┘  │
│       │              │             │              │          │
│  ┌────▼──────────────▼─────────────▼──────────────▼──────┐  │
│  │              ATHLETE DATA FABRIC                       │  │
│  │  L1: Events → L2: Snapshot → L3: Context              │  │
│  │  L4: Recommendations → L5: PDIL Protocols             │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │  Supabase PostgreSQL (RLS) + pgvector + Realtime      │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  PYTHON AI SERVICE      │
          │  (LangGraph + FastAPI)  │
          │  Railway internal net   │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  EXTERNAL SERVICES      │
          │  Anthropic Claude       │
          │  Voyage AI (embeddings) │
          │  Cohere (reranker)      │
          │  Zep (memory)           │
          │  Firebase (push)        │
          │  WHOOP (wearables)      │
          └─────────────────────────┘
```

### Dual-Layer Architecture

The system has two backend layers:

| Layer | Technology | Responsibility |
|-------|-----------|---------------|
| **TypeScript Backend** | Next.js 16, Railway | Session management, capsule tool execution, event pipeline, snapshot writes, safety post-filters, API routes, CMS admin |
| **Python AI Service** | FastAPI, LangGraph, Railway (internal) | LLM orchestration, intent classification, agent dispatch, RAG retrieval, memory management, system prompt assembly |

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Next.js 16, TypeScript, Railway (auto-deploy from GitHub) |
| AI Service | Python, FastAPI, LangGraph, Railway (private networking) |
| Mobile | Expo / React Native (iOS, Android, Web) |
| Database | Supabase PostgreSQL with RLS, pgvector, Realtime |
| AI Models | Claude Haiku 4.5 (agent dispatch), Claude Sonnet 4 (deep refresh) |
| Embeddings | Voyage AI (512-dim, voyage-3-lite) |
| Reranking | Cohere v3.5 |
| Memory | Zep Community Edition (session/fact storage) |
| Push | Firebase Cloud Messaging |
| Wearables | WHOOP (production), Garmin/Oura/Fitbit (schema-ready) |
| Admin UI | shadcn/ui + Next.js client components |

### 5-Layer Athlete Data Fabric

```
Layer 1: Immutable Event Stream     (athlete_events — 28 types, append-only)
    ↓
Layer 2: Pre-computed Snapshot      (athlete_snapshots — 107 fields, O(1) reads)
    ↓
Layer 3: Assembled Context          (PlayerContext — 120+ fields, 14 parallel queries)
    ↓
Layer 4: Recommendation Engine      (athlete_recommendations — 9 types, event-triggered)
    ↓
Layer 5: PDIL Protocols             (pd_protocols — domain expertise, overrides AI)
```

**Key Invariant**: All UI components and AI agents read from Layer 2+ snapshots. No consumer queries raw tables directly.

### Deployment

| Setting | Value |
|---------|-------|
| Host | Railway auto-deploys from GitHub on `git push origin main` |
| Production URL | `https://app.my-tomo.com` |
| Railway URL | `https://5qakhaec.up.railway.app` |
| Backend Port | 8080 |
| Python AI Service URL | `http://tomo-ai.railway.internal:8000` (private networking, <5ms latency) |
| Frontend | Expo web export in `backend/public/webapp/` |

---

## 2. Complete Message Flow

### End-to-End: User Message → AI Response

```
1. USER TAPS SEND (HomeScreen.tsx)
   ↓
   sendAgentChatMessageStreaming() — via mobile/src/services/api.ts
   ↓

2. POST /api/v1/chat/agent?stream=true
   Body: { message, sessionId, activeTab, timezone, capsuleAction?, confirmedAction? }
   ↓

3. BACKEND ROUTE HANDLER (backend/app/api/v1/chat/agent/route.ts)
   ├─ Auth check (requireAuth — Bearer token or cookie)
   ├─ Rate limit (20 requests/minute per user)
   ├─ Message validation (trim, length < 2000 chars)
   ↓

4. SESSION MANAGEMENT
   ├─ getOrCreateSession(userId, sessionId?) — creates fresh or reuses
   └─ saveMessage(session.id, "user", message) — persist user message
   ↓

5. CAPSULE ACTION CHECK — Is this a capsule form submission?
   ┌─────────────────────────────────────────────────────────┐
   │ YES: Capsule Action ($0 cost, no LLM call)             │
   │ ├─ buildPlayerContext() — one-time context fetch        │
   │ ├─ checkRedRiskForTool() — S3 safety gate              │
   │ ├─ Execute tool directly:                               │
   │ │   executeOutputTool() | executeTimelineTool()         │
   │ │   executeMasteryTool() | executeSettingsTool()        │
   │ ├─ Save result to session                               │
   │ └─ Return deterministic response (✅ or ❌)             │
   │   + refreshTargets for cross-screen sync                │
   └─────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │ NO: Full AI Path                                        │
   ↓                                                         │
                                                             │
6. BUILD PLAYER CONTEXT (contextBuilder.ts)                  │
   ├─ 14 parallel Supabase queries (Promise.allSettled)      │
   ├─ Temporal awareness derivation                          │
   ├─ Snapshot enrichment (ACWR, HRV, CCRS, PHV)            │
   └─ Returns PlayerContext (120+ fields)                    │
   ↓                                                         │
                                                             │
7. BUILD AI SERVICE REQUEST                                  │
   {                                                         │
     message, session_id, player_id,                         │
     active_tab, timezone,                                   │
     confirmed_action (if user confirmed write)              │
   }                                                         │
   ↓                                                         │
                                                             │
8. PROXY TO PYTHON AI SERVICE                                │
   ├─ proxyToAIServiceStream() for streaming                 │
   │   → POST http://tomo-ai.railway.internal:8000/api/v1/chat │
   │   → Parse SSE stream                                   │
   │   → Emit events: status, response, done, error         │
   │                                                         │
   └─ proxyToAIServiceSync() for non-streaming              │
      → POST /api/v1/chat/sync                               │
   ↓                                                         │
                                                             │
   ┌─ PYTHON AI SERVICE (LangGraph) ─────────────────────┐  │
   │                                                      │  │
   │ context_assembly → rag_retrieval → pre_router        │  │
   │   → agent_dispatch → validate → format_response      │  │
   │   → persist → RETURN                                 │  │
   │                                                      │  │
   │ (See Section 3 for full LangGraph details)           │  │
   └──────────────────────────────────────────────────────┘  │
   ↓                                                         │
                                                             │
9. POST-RESPONSE SAFETY FILTERS (TS defense-in-depth)        │
   ├─ enforceRedRiskSafety(msg, injuryRiskFlag, acwr)       │
   │   → If RED: sanitize intensity language                 │
   ├─ enforcePHVSafety(msg, phvStage)                       │
   │   → If PHV risk: sanitize high-intensity recs           │
   └─ enforceNoDeadEnds(msg)                                │
      → Ensure every message ends with a CTA                 │
   ↓                                                         │
                                                             │
10. SAVE & RETURN                                            │
    ├─ saveMessage(session.id, "assistant", message)         │
    └─ Return JSON:                                          │
       {                                                     │
         message: string,                                    │
         structured: TomoResponse | null,                    │
         sessionId: string,                                  │
         refreshTargets: string[],                           │
         pendingConfirmation: ConfirmAction | null,          │
         context: { ageBand, readinessScore, activeTab }     │
       }                                                     │
   └─────────────────────────────────────────────────────────┘
   ↓

11. MOBILE SSE PARSER (HomeScreen.tsx)
    ├─ Parse SSE events: status → response delta → done
    ├─ Show typing indicator + character-by-character typewriter
    ├─ Parse structured TomoResponse → cards[]
    ├─ Render via ResponseRenderer (cards + capsules)
    ├─ emitRefresh(target) for cross-screen sync
    └─ Auto-scroll to bottom
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/chat/agent` | POST | Main chat endpoint (streaming via `?stream=true`) |
| `/api/v1/chat/agent-stream` | POST | Dedicated streaming endpoint (SSE) |
| `/api/v1/chat/send` | POST | Legacy endpoint (pre-agent chat) |
| `/api/v1/chat/messages` | GET | Fetch recent chat messages |
| `/api/v1/chat/sessions` | GET/POST | List/create sessions |
| `/api/v1/chat/sessions/[id]` | GET/PATCH | Session CRUD |
| `/api/v1/chat/suggestions` | GET | Dynamic suggestion chips |
| `/api/v1/chat/briefing` | GET | Daily briefing for dashboard |
| `/api/v1/chat/transcribe` | POST | Voice input transcription (m4a) |

### AI Service Proxy Configuration

```typescript
// backend/services/agents/aiServiceProxy.ts

AI_SERVICE_ENABLED:
  "false"   → All TypeScript orchestrator (no Python)
  "shadow"  → Both TS + Python run in parallel; TS serves, Python logged
  "true"    → Python serves 100% of traffic

AI_SERVICE_PERCENTAGE: 0-100 (gradual cutover when enabled=true)
AI_SERVICE_URL: "http://tomo-ai.railway.internal:8000" (production)
                "http://localhost:8000" (local dev)
```

### SSE Event Types

```
event: status  → { status: "Checking your readiness..." }
event: done    → Full response object (same shape as /chat/agent JSON)
event: error   → { error: "..." }
```

---

## 3. LangGraph Supervisor

The Python AI service uses a LangGraph StateGraph to orchestrate multi-step AI reasoning.

### Graph Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  START                                                          │
│    │                                                            │
│    ▼                                                            │
│  context_assembly ─── Populates player_context + aib_summary    │
│    │                                                            │
│    ▼                                                            │
│  rag_retrieval ─────── PropertyGraphIndex hybrid search         │
│    │                                                            │
│    ▼                                                            │
│  pre_router ────────── Intent classify + agent route            │
│    │                                                            │
│    ├── capsule ──── format_response ──── persist ──── END       │
│    │                                                            │
│    ├── confirm ──── execute_confirmed ── validate ──┐           │
│    │                                                │           │
│    └── ai ──────── agent_dispatch ──── validate ────┤           │
│                                                     │           │
│                                        format_response          │
│                                              │                  │
│                                           persist               │
│                                              │                  │
│                                             END                 │
└──────────────────────────────────────────────────────────────────┘
```

### Nodes (8 total)

| Node | File | Purpose |
|------|------|---------|
| `context_assembly` | `ai-service/app/graph/nodes/context_assembly.py` | 11 parallel DB queries → PlayerContext + AIB summary |
| `rag_retrieval` | `ai-service/app/graph/nodes/rag_retrieval.py` | Hybrid 5-signal knowledge retrieval (~$0.003) |
| `pre_router` | `ai-service/app/graph/nodes/pre_router.py` | 3-layer intent classification + 5-way agent routing |
| `agent_dispatch` | `ai-service/app/graph/nodes/agent_dispatch.py` | Agentic tool-calling loop (max 5 iterations) |
| `execute_confirmed` | `ai-service/app/graph/nodes/agent_dispatch.py` | Execute a user-confirmed write action |
| `validate` | `ai-service/app/graph/nodes/validate.py` | PHV safety hard gate + tone validation |
| `format_response` | `ai-service/app/graph/nodes/format_response.py` | Raw text → structured TomoResponse cards |
| `persist` | `ai-service/app/graph/nodes/persist.py` | Save to Zep + longitudinal memory extraction |

### TomoChatState (Central State Object)

```python
# ai-service/app/models/state.py

class TomoChatState(MessagesState):
    # Request metadata
    user_id: str
    session_id: str
    active_tab: str                    # "Chat" | "Timeline" | "Output" | "Mastery" | "OwnIt"
    timezone: str
    request_id: str                    # LangSmith trace correlation

    # Context (populated by context_assembly_node)
    player_context: Optional[PlayerContext]
    aib_summary: Optional[str]         # Pre-synthesized Athlete Intelligence Brief
    memory_context: Optional[str]      # Formatted 4-tier memory block

    # Routing (populated by pre_router_node)
    route_decision: Optional[str]      # "capsule" | "ai"
    capsule_type: Optional[str]
    selected_agent: Optional[str]      # "output" | "timeline" | "mastery" | "settings" | "planning"
    routing_confidence: Optional[float] # 0.0 - 1.0
    classification_layer: Optional[str] # "exact_match" | "haiku" | "fallthrough" | "agent_lock"
    intent_id: Optional[str]           # e.g. "qa_readiness", "log_test"

    # Agent execution
    agent_response: Optional[str]      # Raw agent text output
    tool_calls: list[dict]             # Tools invoked during execution
    card_type: Optional[str]           # stat_grid, session_plan, etc.
    card_data: Optional[dict]

    # Validation
    validation_passed: bool
    validation_flags: list[str]        # ["phv_safety", "tone_violation", ...]

    # Output
    final_response: Optional[str]
    final_cards: list[dict]            # Structured cards for mobile rendering

    # Telemetry
    total_cost_usd: float
    total_tokens: int
    latency_ms: float

    # RAG (populated by rag_retrieval_node)
    rag_context: Optional[str]         # Formatted knowledge text for prompt
    rag_metadata: Optional[dict]       # Entity/chunk counts, cost

    # Multi-Tenant
    tenant_context: Optional[TenantContext]

    # Write actions (interrupt/resume)
    pending_write_action: Optional[dict]
    write_confirmed: bool

    # Observability
    _observability: Optional[dict]     # LangSmith metadata
```

### Agent Dispatch Loop

```python
# ai-service/app/graph/nodes/agent_dispatch.py

MAX_ITERATIONS = 5
MAX_TOOL_RESULT_CHARS = 3000

async def agent_dispatch_node(state):
    # 1. Get tools for selected agent (+ secondary agents if multi-agent routing)
    tools = get_tools_for_agent(agent_type, user_id, context, secondary_agents)

    # 2. Build 2-block system prompt (static cached + dynamic per-request)
    static_block, dynamic_block = build_system_prompt(agent_type, context, aib_summary)

    # 2b. Inject intent guidance (readiness question? emotional check-in? greeting?)
    # 2c. Inject RAG context (knowledge graph text)
    # 2d. Inject memory context (4-tier athlete memory)

    # 3. Create Haiku 4.5 LLM with tools bound
    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", temperature=0.3, max_tokens=4096)

    # 4. Build message list: [system (2-block)] + [conversation history]

    # 5. Agentic loop (max 5 iterations)
    for iteration in range(MAX_ITERATIONS):
        response = await llm_with_tools.ainvoke(all_messages)

        # Track telemetry (tokens, cost, cache hits)
        # No tool calls → done

        # Check for WRITE actions → interrupt, return PendingWriteAction
        write_calls = [tc for tc in response.tool_calls if is_write_action(tc["name"])]
        if write_calls:
            return { pending_write_action: {...}, agent_response: text_before_tools }

        # Execute READ tools → feed results back to LLM
        for tc in response.tool_calls:
            result = await tool_fn.ainvoke(tc["args"])
            all_messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))

    return { agent_response, tool_calls, total_cost_usd, total_tokens, latency_ms }
```

### Routing Logic

```python
# Route after pre_router
def route_after_pre_router(state) -> "capsule" | "confirm" | "ai":
    if state.write_confirmed and state.pending_write_action:
        return "confirm"       # Execute the confirmed write
    if state.route_decision == "capsule":
        return "capsule"       # Skip agent, go to format_response
    return "ai"                # Full agent dispatch
```

---

## 4. 3-Layer Intent Classification

### Architecture

```
User Message
    │
[Layer 1: Exact Match] ── $0, <1ms ── 60+ hardcoded phrases
    │
[Layer 2: Haiku AI] ── ~$0.0001, <200ms ── context-aware classification
    │
[Layer 3: Full Agent Fallthrough] ── $0.001-0.02 ── 3-agent system with tools
```

### Layer 1: Exact Match ($0, <1ms)

60+ hardcoded phrases mapped directly to intents:

| Phrase | Intent |
|--------|--------|
| "check in" | `check_in` |
| "log a test" | `log_test` |
| "plan my training" | `plan_training` |
| "what's my readiness" | `qa_readiness` |
| "my week" | `qa_week_schedule` |
| "plan my regular study" | `plan_regular_study` |

### 16 Fallthrough Prefixes (Layer 1 → Layer 3)

Complex queries bypass Haiku and go straight to full AI:

- "tell me more about..." / "explain the/my/this..."
- "what should I do about/based/today..." / "how do I..."
- "can you recommend/suggest/advise..." / "help me understand..."
- Pain/injury mentions
- Program/drill specifics
- Recommendation references
- Readiness interpretation

### Layer 2: Haiku AI (~$0.0001, <200ms)

Context-aware classifier with 3 critical rules:
1. Specific program by name → `agent_fallthrough` (NOT `show_programs`)
2. Specific recommendation reference → `agent_fallthrough`
3. Pain/injury context → `agent_fallthrough` (NOT `qa_readiness`)

Confidence threshold: **0.65** minimum to trigger capsule handler.

### Layer 3: Full Agent Orchestrator

Falls through when:
- Confidence < 0.65
- Handler returns null (needs AI reasoning)
- Complex multi-turn conversations
- Any of the 16 fallthrough prefixes matched

### Agent Lock

Stays with current agent unless explicit topic shift detected. Prevents context thrashing during multi-turn flows.

```python
# pre_router_node
if last_agent and should_keep_agent_lock(user_message, last_agent, None):
    return { selected_agent: last_agent, classification_layer: "agent_lock" }
```

### Agent Routing Signals

| Signal | Routes To |
|--------|-----------|
| Program queries | Output |
| Recovery/recommendation follow-ups | Output ONLY |
| Readiness, vitals, tests, drills, benchmarks | Output |
| Schedule, calendar, events, exams, study | Timeline |
| Progress, CV, achievements, streaks, recruitment | Mastery |
| Active tab context | Default to that agent |
| Affirmations ("yes", "do it") | Stay with previous agent (lock) |

### Multi-Agent Support

When a message triggers 2+ agents (e.g., "Schedule recovery and check readiness"), both agents are routed. Primary agent's tools come first, secondary agent tools appended.

---

## 5. Complete Intent Registry

### Test & Check-In (2)

| Intent ID | Capsule | Agent | Description |
|-----------|---------|-------|-------------|
| `log_test` | `test_log_capsule` | output | Log physical test result |
| `check_in` | `checkin_capsule` | output | Daily readiness check-in |

### Navigation (1)

| `navigate` | `navigation_capsule` | output | Go to app tab |

### Programs (2)

| `show_programs` | `program_action_capsule` | output | Browse training programs |
| `manage_programs` | `program_interact_capsule` | output | Manage program status |

### Calendar Events (2)

| `create_event` | `event_edit_capsule` | timeline | Add calendar event |
| `delete_event` | `event_edit_capsule` | timeline | Remove calendar event |

### CV/Profile (1)

| `edit_cv` | `cv_edit_capsule` | mastery | Edit player profile |

### Schedule Rules (1)

| `schedule_rules` | `schedule_rules_capsule` | timeline | View/edit schedule preferences |

### Training Plan (1)

| `plan_training` | `training_schedule_capsule` | timeline | Auto-fill training week |

### Study Plan (2)

| `plan_study` | `study_schedule_capsule` | timeline | Plan study around exams |
| `plan_regular_study` | `regular_study_capsule` | timeline | Recurring weekly study routine |

### Exams (2)

| `add_exam` | `exam_capsule` | timeline | Add exam date |
| `exam_schedule` | `event_edit_capsule` | timeline | Schedule exam on calendar |

### Subjects & Categories (2)

| `manage_subjects` | `subject_capsule` | timeline | Manage study subjects |
| `training_categories` | `training_category_capsule` | timeline | Manage training categories |

### Conflicts (1)

| `check_conflicts` | `conflict_resolution_capsule` | timeline | Detect schedule conflicts |

### PHV/Growth (2)

| `phv_query` | null | output | Check existing growth stage |
| `phv_calculate` | `phv_calculator_capsule` | output | Calculate PHV measurements |

### Strengths & Gaps (1)

| `strengths_gaps` | `strengths_gaps_capsule` | output | Performance profile |

### Leaderboard (1)

| `leaderboard` | `leaderboard_capsule` | mastery | View rankings |

### Ghost Suggestions (1)

| `ghost_suggestions` | `ghost_suggestion_capsule` | timeline | Pattern-based schedule suggestions |

### Bulk Edit (1)

| `bulk_edit_events` | `bulk_timeline_edit_capsule` | timeline | Bulk edit/delete events |

### Day Lock (1)

| `day_lock` | `day_lock_capsule` | timeline | Lock/unlock calendar day |

### Wearable (1)

| `whoop_sync` | `whoop_sync_capsule` | output | Sync Whoop data |

### Sport-Specific (2)

| `padel_shots` | `padel_shot_capsule` | output | Log padel shots |
| `blazepods` | `blazepods_capsule` | output | Log BlazePods session |

### Notifications (1)

| `notification_settings` | `notification_settings_capsule` | output | Notification preferences |

### Recommendations (1)

| `recommendations` | null | output | Personalized recs (falls through to AI) |

### Timeline Capabilities (1)

| `timeline_capabilities` | null | timeline | List available calendar features |

### Drill Rating (1)

| `drill_rating` | `drill_rating_capsule` | output | Rate drill difficulty |

### Quick Actions (6) — All fast-path $0

| `qa_readiness` | `quick_action` | output | Check readiness score |
| `qa_streak` | `quick_action` | mastery | Check streak |
| `qa_load` | `quick_action` | output | Check training load/ACWR |
| `qa_today_schedule` | `quick_action` | timeline | Today's schedule |
| `qa_week_schedule` | `quick_action` | timeline | This week's schedule |
| `qa_test_history` | `quick_action` | output | Test result history |

### Journal (2)

| `journal_pre` | `training_journal_pre_capsule` | output | Pre-session target |
| `journal_post` | `training_journal_post_capsule` | output | Post-session reflection |

---

## 6. Agent System & All Tools

### 5 Agent Types

| Agent | # Tools | Domain |
|-------|---------|--------|
| **Output** | 22 | Readiness, vitals, tests, drills, programs, benchmarks, journaling |
| **Timeline** | 17 | Calendar CRUD, schedule rules, study plans, ghost suggestions |
| **Mastery** | 7 | CV, achievements, career history, consistency |
| **Settings** | 22 | Profile, goals, injuries, nutrition, sleep, notifications, wearables |
| **Planning** | 5 | Planning context, mode options, protocol details |

### Tool Factory Pattern

```python
# ai-service/app/agents/tools/__init__.py

TOOL_FACTORIES = {
    "output":   make_output_tools,
    "timeline": make_timeline_tools,
    "mastery":  make_mastery_tools,
    "settings": make_settings_tools,
    "planning": make_planning_tools,
}

def get_tools_for_agent(agent_type, user_id, context, secondary_agents=None):
    tools = TOOL_FACTORIES[agent_type](user_id, context)
    # Merge secondary agent tools for multi-agent routing
    if secondary_agents:
        for sec in secondary_agents:
            tools.extend(TOOL_FACTORIES[sec](user_id, context))
    return tools
```

### Tool Bridge Architecture

```
Python AI Service
  ├── READ tools  → Direct Supabase queries (psycopg3)
  └── WRITE tools → HTTP proxy to TS backend endpoints
                     → TS event pipeline fires correctly
                     → emitEventSafe → processEvent → writeSnapshot
```

```python
# ai-service/app/agents/tools/bridge.py
# Uses httpx.AsyncClient with connection pooling
# Auth: Supabase service role key in Authorization header
# Internal header: X-Tomo-Internal: ai-service
```

### Output Agent — 22 Tools

**Read Tools:**

| Tool | Description |
|------|-------------|
| `get_readiness_detail` | Full readiness breakdown (energy, soreness, sleep, mood, stress, pain) |
| `get_vitals_trend` | Wearable data trends (HRV, HR, sleep, recovery) over N days |
| `get_checkin_history` | Check-in trends (max 30 days) |
| `get_dual_load_score` | ACWR, ATL, CTL, dual-load index, injury risk |
| `get_test_results` | Test history (reaction, jump, sprint, agility, balance) |
| `get_training_session` | 6-drill personalized session (readiness + gaps aware) |
| `get_drill_detail` | Full drill info (instructions, equipment, progressions) |
| `get_benchmark_comparison` | Percentile rankings vs age/position peers |
| `get_training_program_recommendations` | Multi-week programs based on gaps + PHV |
| `get_my_programs` | Current programs (AI + coach-assigned) |
| `get_program_by_id` | Specific program details |
| `get_test_catalog` | Available test catalog for logging |
| `get_today_training_for_journal` | Today's events for journaling |
| `get_pending_post_journal` | Events needing post-session reflection |

**Write Tools:**

| Tool | Description |
|------|-------------|
| `log_check_in` | Daily check-in (calculates Green/Yellow/Red readiness) |
| `log_test_result` | Log test score (auto-detects unit) |
| `rate_drill` | Rate drill (1-5 stars + difficulty + completion) |
| `calculate_phv_stage` | Calculate + record PHV maturity stage |
| `save_journal_pre` | Pre-session target + mental cue + focus tag |
| `save_journal_post` | Post-session outcome + reflection + body feel |
| `interact_program` | Dismiss/mark-done program |
| `sync_whoop` | Trigger Whoop sync |

### Timeline Agent — 17 Tools

**Read Tools:**

| Tool | Description |
|------|-------------|
| `get_today_events` | Calendar events for a date (timezone-aware) |
| `get_week_schedule` | 7-day schedule grouped by date |
| `detect_load_collision` | Dual-load conflict detection (exam + training) |
| `get_ghost_suggestions` | Pattern detection from 28-day history |

**Write Tools:**

| Tool | Description |
|------|-------------|
| `create_event` | Add calendar event (auto-estimates load) |
| `update_event` | Edit event fields + bridge to event stream |
| `delete_event` | Remove future event + bridge deletion |
| `bulk_delete_events` | Batch delete with individual bridges |
| `update_schedule_rules` | Update player preferences |
| `generate_training_plan` | Multi-week training plan creator |
| `add_exam` | Add exam to schedule |
| `generate_study_plan` | Configure exam study period |
| `generate_regular_study_plan` | Weekly study plan with smart slot-finding |
| `confirm_ghost_suggestion` | Accept pattern-based suggestion |
| `dismiss_ghost_suggestion` | Reject suggestion |
| `lock_day` | Lock calendar day |
| `unlock_day` | Unlock calendar day |

### Mastery Agent — 7 Tools

| Tool | Description |
|------|-------------|
| `get_achievement_history` | Milestones + personal bests |
| `get_test_trajectory` | Score improvement over time (monthly) |
| `get_cv_summary` | Performance identity snapshot |
| `get_consistency_score` | Check-in frequency + training adherence |
| `list_career_history` | Club/academy history |
| `add_career_entry` | Add club, academy, national team, trial |
| `update_career_entry` | Edit career entry |

### Settings Agent — 22 Tools

| Tool | Description |
|------|-------------|
| `get_goals` | Current goals |
| `get_injury_status` | Active injuries |
| `get_nutrition_log` | Recent nutrition |
| `get_sleep_log` | Sleep records |
| `get_profile` | User profile |
| `get_notification_preferences` | Alert settings |
| `get_schedule_rules` | Schedule preferences |
| `get_wearable_status` | Connected devices |
| `get_drill_library` | Available drills |
| `navigate_to` | Deep link navigation |
| `set_goal` | Create goal |
| `complete_goal` | Mark goal done |
| `delete_goal` | Remove goal |
| `log_injury` | Record injury |
| `clear_injury` | Clear injury |
| `log_nutrition` | Record meal |
| `log_sleep` | Record sleep |
| `update_profile` | Edit profile |
| `update_notification_preferences` | Change alerts |
| `update_schedule_rules` | Edit schedule prefs |
| `toggle_league_mode` | League active flag |
| `toggle_exam_period` | Exam period flag |
| `sync_wearable` | Sync device |

### Planning Agent — 5 Tools

| Tool | Description |
|------|-------------|
| `get_planning_context` | Current planning state |
| `get_mode_options` | Available training modes |
| `propose_mode_change` | Suggest mode transition |
| `get_current_plan` | Active plan details |
| `get_protocol_details` | PDIL protocol info |

### Write Action Detection

```python
# ai-service/app/agents/tools/bridge.py

WRITE_ACTIONS = {
    "create_event", "update_event", "delete_event", "bulk_delete_events",
    "log_check_in", "log_test_result", "update_schedule_rules",
    "generate_training_plan", "add_exam", "generate_study_plan",
    "generate_regular_study_plan", ...
}

CAPSULE_DIRECT_ACTIONS = {
    "log_test_result", "log_check_in", "rate_drill", "interact_program",
    "confirm_ghost_suggestion", "dismiss_ghost_suggestion", "lock_day",
    "unlock_day", "sync_whoop", "generate_regular_study_plan", ...
}
```

### Confirmation Flow

1. Claude generates tool_use → agent_dispatch detects WRITE_ACTION
2. Agent loop halts → returns PendingWriteAction with preview text
3. Mobile renders ConfirmationCard
4. Player confirms → `confirmed_action` sent back to `/chat/agent`
5. Pre_router routes to `execute_confirmed` → tool runs → validate → format → persist

---

## 7. Context Builder

### Overview

`buildPlayerContext()` assembles the complete athlete context ONCE per request. It runs 14 parallel Supabase queries with `Promise.allSettled` for graceful fallbacks.

### 14 Parallel Queries

| # | Query | Data |
|---|-------|------|
| 1 | `users` | Name, sport, position, age, school hours, streak |
| 2 | `calendar_events` (today) | Today's events |
| 3 | `checkins` (latest) | Latest readiness (energy, soreness, sleep, mood) |
| 4 | `health_data` (3 days) | HRV, resting HR, sleep, recovery |
| 5 | `calendar_events` (exams 14d) | Upcoming exams |
| 6 | `phone_test_sessions` (20) | Recent test scores |
| 7 | `player_schedule_preferences` | Schedule rules + scenarios |
| 8 | `athlete_snapshots` | ACWR, ATL, CTL, HRV, wellness trends, CV, PHV |
| 9 | `calendar_events` (7d load) | Projected load forecast |
| 10 | `athlete_recommendations` | Active recommendations (top 5) |
| 11 | `normative_data` | Benchmark profile (percentile + strengths/gaps) |
| 12 | `calendar_events` (next 7d) | Upcoming events |
| 13 | `wearable_connections` | WHOOP status |
| 14 | `football_test_results` | Merged test data |

### PlayerContext Structure (~120 fields)

```typescript
interface PlayerContext {
  // ── Identity & Demographics ──
  userId: string;
  name: string;
  sport: string;               // football, soccer, basketball, tennis, padel
  position: string;            // e.g. CB, CM, ST, GK
  ageBand: string;             // U13, U15, U17, U19, U21, SEN, VET
  gender: string;
  heightCm: number;
  weightKg: number;
  role: string;                // athlete, coach, parent

  // ── Today's Snapshot ──
  todayDate: string;           // ISO, timezone-aware
  currentTime: string;
  todayEvents: CalendarEvent[];
  readinessScore: number;      // 0-100

  // ── Readiness Components (latest check-in) ──
  readinessComponents: {
    energy: number;            // 1-10
    soreness: number;          // 1-10
    sleepHours: number;
    mood: number;              // 1-10
    academicStress: number;    // 1-10
    painFlag: boolean;
  };

  // ── Temporal Awareness ──
  temporalContext: {
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    isMatchDay: boolean;
    matchDetails: string | null;
    isExamProximity: boolean;
    examDetails: string | null;
    dayType: "rest" | "light" | "training" | "competition" | "exam";
    suggestion: string;        // Auto-generated based on context
  };

  // ── Snapshot Enrichment (from athlete_snapshots) ──
  snapshotEnrichment: {
    // Load
    acwr: number;              // Acute:Chronic Workload Ratio
    atl7day: number;           // Acute Training Load
    ctl28day: number;          // Chronic Training Load
    injuryRiskFlag: "GREEN" | "AMBER" | "RED";
    athleticLoad7day: number;
    academicLoad7day: number;
    dualLoadIndex: number;

    // HRV & Wellness
    hrvBaselineMs: number;
    hrvTodayMs: number;
    sleepQuality: number;      // 0-10
    wellness7dayAvg: number;
    wellnessTrend: "improving" | "stable" | "declining";

    // CCRS (Cascading Confidence Readiness Score)
    ccrs: number;              // 0-100
    ccrsRecommendation: "full_load" | "moderate" | "reduced" | "recovery" | "blocked";
    ccrsAlertFlags: string[];  // ["ACWR_BLOCKED", "HRV_SUPPRESSED", "SLEEP_DEFICIT", ...]

    // PHV (Peak Height Velocity)
    phvStage: string;          // pre_phv, mid_phv, post_phv
    phvOffsetYears: number;

    // Performance
    overallPercentile: number;
    topStrengths: string[];
    topGaps: string[];
  };

  // ── Active Recommendations ──
  activeRecommendations: {
    recType: string;
    priority: number;          // 1=urgent, 2=today, 3=this week, 4=info
    title: string;
    bodyShort: string;
    confidence: number;
  }[];

  // ── Schedule Context ──
  schedulePreferences: PlayerSchedulePreferences;
  activeScenario: "normal" | "league_active" | "exam_period" | "league_and_exam";
  planningContext: string;

  // ── Wearable Status ──
  wearableStatus: {
    whoop: {
      connected: boolean;
      dataFresh: boolean;
      syncStatus: string;
      lastSyncAt: string;
      hoursSinceSync: number;
    };
  };

  // ── Routing ──
  activeTab: string;
  lastUserMessage: string;
  timezone: string;
}
```

---

## 8. System Prompt Architecture

### 2-Block Caching Strategy

```
Block 1 (STATIC, cached ~2000-2500 tokens):
  ├── Coaching Identity (8 Companion Clauses)
  ├── Response Architecture (2 response types)
  ├── Gen Z Response Rules
  ├── Output Format Instructions
  └── Agent-specific static prompt

Block 2 (DYNAMIC, per-request ~2000-4000 tokens):
  ├── Intent guidance ("CURRENT INTENT: READINESS QUESTION")
  ├── Athlete memory (longitudinal memory block)
  ├── Sport-position context
  ├── Age-band communication profile
  ├── Agent-specific dynamic context
  ├── Temporal context (time of day, match day, exam proximity)
  ├── Schedule rule context (school hours, buffers, scenarios)
  ├── Active recommendations (grouped by type with priority)
  ├── RAG knowledge grounding (for advisory queries)
  ├── Conversation state (dates, events, drills from prior turns)
  ├── Today's events summary
  ├── Readiness snapshot
  ├── Wearable status
  └── CCRS recommendation
```

### The 8 Companion Clauses

Tomo's core coaching personality is defined by 8 immutable rules:

1. **FRIEND FIRST, SCIENCE SECOND** — Surface human observation before data
2. **BROTHER HONESTY** — No softening that removes truth, no harshness that removes care
3. **NO LECTURE, NO REPORT** — Zero educational preamble
4. **SPEAK THEIR LANGUAGE** — Sport science terms → plain language always
5. **ASK, DON'T ASSUME** — When context is thin, ask one honest question
6. **CELEBRATE LIKE A MATE** — Specific and genuine, never generic
7. **STRUGGLE SOLIDARITY** — Acknowledge before redirecting, never toxic positivity
8. **NO FALSE URGENCY** — Unless genuine safety trigger, tone is calm

### Two Response Types

**TYPE 1: CONVERSATIONAL** (when athlete shares, asks opinion, seeks perspective)
```
HEADLINE (Layer 1 — max 10 words):
  Pick mode: AFFIRM | REFRAME | VALIDATE | CHALLENGE

BODY (Layer 2 — max 2-3 sentences):
  Honest coaching response, data-grounded when relevant

NUDGE (Layer 3 — one question or CTA):
  Open-ended question or next action suggestion
```

**TYPE 2: STRUCTURED** (when athlete asks you to build/create/plan something)
```
HEADLINE (brief intro, max 10 words)
CARDS (stat_grid, session_plan, schedule_list, etc.)
NUDGE (follow-up suggestion)
```

### Age-Band Communication Profiles

| Band | Style |
|------|-------|
| U13 | Simple, warm, short. No jargon. Celebrate effort. |
| U15 | Peer-level, data introduced simply. Protect confidence. |
| U17 | Direct, honest. Data-grounded advice expected. |
| U19 | Professional peer. Technical language welcome. Recruitment context. |
| Senior | Data-dense, direct. Skip motivational framing. |

### Gen Z Response Rules

1. Headline FIRST (max 8 words)
2. Max 2 sentences total explanation
3. Emojis: energy, sleep, training, goals, schedule, streaks, soreness
4. NO filler ("Great question!", "Absolutely!", "Based on your data")
5. Direct. Brief. Useful. Max 3 sentences text TOTAL
6. For programs: ALWAYS use `program_recommendation` card
7. For schedule: ALWAYS use `schedule_list` card

### Things Tomo NEVER Says

- "Amazing!", "Fantastic!", "Incredible work!", "You've got this!", "Keep pushing!"
- "The athlete should consider...", "It is recommended that..."
- "Research shows that...", "According to your data...", "Your metrics indicate..."
- "Thank you for your input", "Session has been generated"
- "I'm just an AI", "As an AI, I don't...", "I don't have feelings"
- More than 1 emoji per message
- Opening with their name as a hook

### Sport-Position Context

| Sport | Key Benchmarks | Position Specifics |
|-------|---------------|-------------------|
| Football | Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test | GK/CB/CM/ST |
| Padel | BlazePods, lateral movement, wrist/forearm loading | — |
| Athletics | Event-specific (sprints, throws, jumps) | — |
| Basketball | Vertical jump, agility, sprint, court coverage | — |
| Tennis | Lateral movement, serve velocity, rally endurance | — |

### PHV Safety Overlay (Mid-PHV Athletes)

- Loading multiplier: **0.60x**
- **BLOCKED movements**: barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift, 1RM testing
- **Alternatives injected**: goblet squat, soft-landing box steps, light dumbbells, 85% effort drills, trap bar

---

## 9. Capsule Components

30 interactive inline cards with embedded forms:

| # | Capsule | Purpose |
|---|---------|---------|
| 1 | `test_log_capsule` | Two-tier test selector + score input |
| 2 | `checkin_capsule` | Emoji-scale energy/sleep/soreness/pain |
| 3 | `event_edit_capsule` | Create/update/delete calendar events |
| 4 | `training_schedule_capsule` | Plan training week (fixed days or spread) |
| 5 | `study_schedule_capsule` | Exam planner + study block generator |
| 6 | `regular_study_capsule` | Weekly recurring study (subjects, days, duration, weeks) |
| 7 | `training_journal_pre_capsule` | Pre-session target + mental cue + focus tag |
| 8 | `training_journal_post_capsule` | Post-session reflection + outcome rating |
| 9 | `schedule_rules_capsule` | Edit scenario, school hours, sleep times |
| 10 | `conflict_resolution_capsule` | Show conflicts + resolution suggestions |
| 11 | `program_action_capsule` | Program card with priority badge + actions |
| 12 | `program_interact_capsule` | Browse programs with action buttons |
| 13 | `drill_rating_capsule` | Star rating + difficulty + completion status |
| 14 | `cv_edit_capsule` | Inline profile editor |
| 15 | `navigation_capsule` | Deep-link to app tabs |
| 16 | `phv_calculator_capsule` | PHV measurement form |
| 17 | `strengths_gaps_capsule` | Percentile display + strengths/gaps |
| 18 | `padel_shot_capsule` | Padel shot type selector |
| 19 | `blazepods_capsule` | BlazePods drill logger |
| 20 | `notification_settings_capsule` | Notification preference toggles |
| 21 | `whoop_sync_capsule` | Whoop sync trigger |
| 22 | `leaderboard_capsule` | Rankings with medals |
| 23 | `day_lock_capsule` | Lock/unlock calendar day |
| 24 | `ghost_suggestion_capsule` | Accept/dismiss pattern suggestions |
| 25 | `exam_capsule` | Add exams with subject/type/date |
| 26 | `subject_capsule` | Manage study subjects list |
| 27 | `training_category_capsule` | Manage training categories |
| 28 | `bulk_timeline_edit_capsule` | Grouped bulk event selector |
| 29 | `club_edit_capsule` | Add/edit club history |
| 30 | `strengths_gaps_capsule` | Display benchmark comparison (read-only) |

### Capsule Submission Flow

```
User interacts with Capsule form
  ↓
Fills form (e.g., energy=7, mood=8)
  ↓
Taps Submit
  ↓
Mobile sends capsuleAction:
  { toolName: "log_check_in", toolInput: {...}, agentType: "output" }
  → POST /api/v1/chat/agent
  ↓
Backend executes tool DIRECTLY (no LLM call, $0)
  ├─ buildPlayerContext()
  ├─ checkRedRiskForTool() (S3 safety gate)
  ├─ executeOutputTool(toolName, toolInput, context)
  └─ Returns: ✅ "Check-in saved!" + refreshTargets: ["output"]
  ↓
Mobile: emitRefresh("output") → all subscribed hooks refetch
```

### Capsule Direct vs Gated

**Direct Actions** (capsule submit = confirmation):
```
log_test_result, log_check_in, rate_drill, interact_program,
confirm_ghost_suggestion, dismiss_ghost_suggestion, lock_day,
unlock_day, sync_whoop, generate_regular_study_plan
```

**Gated Actions** (two-step, show ConfirmationCard first):
```
delete_test_result, edit_test_result, schedule_program,
create_event, update_event, delete_event, bulk_delete_events,
update_schedule_rules, generate_training_plan, add_exam,
generate_study_plan
```

---

## 10. Visual Card Types

15 passive display cards rendered by `ResponseRenderer.tsx`:

| Card Type | Purpose |
|-----------|---------|
| `stat_row` | Single metric with optional trend |
| `stat_grid` | 3+ metrics in a grid |
| `schedule_list` | Calendar events for day/week |
| `week_schedule` | Full week calendar view |
| `zone_stack` | Green/Yellow/Red readiness zones |
| `clash_list` | Schedule conflicts with fixes |
| `benchmark_bar` | Percentile bar chart |
| `text_card` | Brief advice (max 2 sentences) |
| `coach_note` | Single coaching insight |
| `confirm_card` | Two-step confirmation |
| `session_plan` | Training session with drills |
| `drill_card` | Detailed drill info |
| `schedule_preview` | Events with violations + alternatives |
| `program_recommendation` | Recommended programs with weekly plan |
| `phv_assessment` | Maturity stage results |

### TomoResponse Structure

```typescript
interface TomoResponse {
  headline: string;               // Max 8 words
  body?: string;                  // 2-4 sentences coaching text
  cards: VisualCard[];            // Structured data + capsules
  chips?: ActionChip[];           // Suggestion buttons
  confirm?: ConfirmAction;        // Pending confirmation
}
```

---

## 11. Safety & Guardrails

### Multi-Layer Safety Architecture

```
Layer 1: Pre-flight Check (regex, TS side) ── Before any AI call
Layer 2: System Prompt Injection (Python) ── During LLM generation
Layer 3: PHV Safety Hard Gate (Python validate_node) ── After generation
Layer 4: Post-Response Filters (TS side) ── Before returning to mobile
```

### Layer 1: Pre-flight Check

Fast regex classifier in `chatGuardrails.ts`:

**Allowed Topics:**
- Athletic performance & training
- Sports science & recovery
- Student-athlete academic-athletic balance
- Scheduling & calendar management
- Benchmarks, performance data, recruiting

**Blocked Patterns:**
| Category | Patterns |
|----------|----------|
| Self-harm | `kill myself`, `suicide`, `self.?harm`, `want to die` |
| Politics | `trump`, `biden`, `election`, `israel/palestine` |
| Adult content | `sex`, `porn`, `nude` |
| Violence | `how to kill`, `murder`, `attack`, `weapons`, `terrorism` |
| Drugs | `weed`, `cocaine`, `steroids`, `how to get drugs` |
| Hate speech | Discriminatory language |
| Financial | `investing`, `stocks`, `crypto` |
| General AI tasks | `write an essay`, `code`, `homework`, `translate` |
| Gambling | Betting-related |

### Layer 3: PHV Safety Hard Gate

```python
# ai-service/app/graph/nodes/validate.py

PHV_BLOCKED_PATTERNS = [
    r"\bbarbell\s+(?:back\s+)?squat",
    r"\bdepth\s+jump", r"\bdrop\s+jump",
    r"\bolympic\s+lift", r"\bclean\s+and\s+jerk", r"\bsnatch\b",
    r"\bmax(?:imal)?\s+sprint",
    r"\bheavy\s+deadlift",
    r"\bmax\s+(?:effort\s+)?(?:squat|deadlift|bench)",
    r"\b1\s*rm\b",
    r"\bplyometric.*max",
]

# If Mid-PHV athlete + blocked pattern in response → REPLACE entire response
# with safe alternatives (goblet squat, soft-landing box steps, etc.)
```

### Layer 4: Post-Response Filters (TS)

| Filter | Trigger | Action |
|--------|---------|--------|
| `enforceRedRiskSafety` | `injuryRiskFlag == RED` | Sanitize intensity language |
| `enforcePHVSafety` | `phvStage == mid_phv` | Sanitize high-intensity recs |
| `enforceNoDeadEnds` | Every response | Ensure CTA at end |

---

## 12. RAG Knowledge System

### Architecture

```
User Query
  ↓
Sub-question Decomposition (Haiku, ~$0.0001)
  ↓ optional, for complex queries
Hybrid 5-Signal Retrieval
  ├── 1. Vector search on knowledge entities (pgvector)
  ├── 2. Vector search on knowledge chunks (pgvector)
  ├── 3. Full-text search on entities (PostgreSQL tsvector)
  ├── 4. BM25-style text search on chunks (ts_rank_cd)
  └── 5. Graph traversal from top entities (1-hop + 2-hop)
  ↓
2-Stage Reranking (Cohere v3.5 + state-aware boosting)
  ↓
Top 3 chunks (max 400 tokens each) injected into dynamic prompt block
```

### Knowledge Storage

```sql
-- backend/supabase/migrations/00000000000016_rag_knowledge_chunks.sql

CREATE TABLE rag_knowledge_chunks (
  chunk_id UUID PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  title TEXT,
  content TEXT,
  athlete_summary TEXT,
  coach_summary TEXT,
  rec_types TEXT[],              -- Which recommendation types
  phv_stages TEXT[],             -- Which PHV stages
  age_groups TEXT[],             -- Which age bands
  sports TEXT[],                 -- "all" or specific sports
  contexts TEXT[],               -- Metadata for filtering
  embedding vector(512),         -- Voyage AI embeddings
  primary_source TEXT,
  evidence_grade TEXT,
  last_reviewed DATE
);

-- HNSW index for fast approximate nearest-neighbor search
-- SQL function: match_knowledge_chunks(query_embedding, filters, match_count, threshold)
```

### RAG Integration in Agent Dispatch

```python
# Injected into dynamic block of system prompt:
dynamic_block += f"\n\n{rag_context}"  # Formatted knowledge text
```

### Cost

| Component | Cost |
|-----------|------|
| Embedding (Voyage AI) | ~$0.0001 per query |
| Reranking (Cohere) | ~$0.002 per query |
| Total per RAG query | ~$0.003 |
| Latency target | <500ms |

### Content

- 24 sports science knowledge chunks
- 8 position-specific chunks (football, padel, athletics, basketball, tennis)
- Topic-to-RecType mapping (sleep → READINESS/RECOVERY, load → LOAD_WARNING, etc.)

---

## 13. 4-Tier Athlete Memory

### Memory Tiers

| Tier | Source | Scope | Cost |
|------|--------|-------|------|
| **Working Memory** | LangGraph `state.messages` | Current conversation | $0 |
| **Episodic Memory** | Zep sessions | Per-session history + summaries | $0 |
| **Semantic Memory** | Zep fact extraction | Cross-session facts + entities | $0 |
| **Procedural Memory** | Athlete Intelligence Brief (AIB) | Pre-synthesized coaching narrative | Haiku |

### Longitudinal Memory (Cross-Session)

```typescript
// athlete_longitudinal_memory table

interface AthleteMemory {
  currentGoals: string[];          // e.g., "Improve 10m sprint to under 1.75s"
  unresolvedConcerns: string[];    // e.g., "Left knee tightness after sprints"
  injuryHistory: string[];         // e.g., "Osgood-Schlatter diagnosed Jan 2026"
  behavioralPatterns: string[];    // e.g., "Tends to overtrain before matches"
  coachingPreferences: string[];   // e.g., "Prefers data-driven feedback"
  lastTopics: string[];            // Last 5 session topics
  keyMilestones: string[];         // e.g., "Hit P75 on CMJ March 2026"
}
```

### Memory Loading (Session Start)

```typescript
// backend/services/agents/longitudinalMemory.ts
loadAthleteMemory(athleteId) →
  Fetch memory → Format as prompt block:
  "ATHLETE MEMORY (from X previous sessions)"
  → Most recent 3 goals, 3 concerns, 3 milestones, 2 patterns + last summary
  → Injected into Block 2 of system prompt
```

### Memory Updating (Session End)

```typescript
updateAthleteMemory(athleteId, conversationHistory) →
  Trigger: 5+ turns (>=10 messages)
  Model: Claude Haiku (~$0.0002 per call)
  Extracts: sessionSummary, newGoals, newConcerns, injuryMentions,
            patterns, preferences, milestones, resolvedConcerns
  Merge: upsert into athlete_longitudinal_memory
  Timing: Non-blocking (fire-and-forget)
```

### Python Memory Service

```python
# ai-service/app/services/memory_service.py

# 4-tier orchestration:
# 1. Working Memory — state.messages (LangGraph)
# 2. Episodic Memory — Zep sessions (per-session summaries)
# 3. Semantic Memory — Zep fact extraction (cross-session entities)
# 4. Procedural Memory — AIB (pre-synthesized Haiku narrative)

# Fetch flow (context_assembly_node):
#   Parallel fetch of Zep facts + recent summaries + DB longitudinal memory

# Save flow (persist_node):
#   Save turn to Zep, trigger Haiku extraction after 5+ turns
```

---

## 14. Recommendation Intelligence Engine

### Architecture

Dual-stream: Event-triggered (real-time) + Deep Refresh (Claude-powered holistic analysis)

### 9 Recommendation Types

| Type | Description | Expiry |
|------|-------------|--------|
| `READINESS` | Daily readiness checks | 24h |
| `LOAD_WARNING` | Overtraining warnings | 24h |
| `RECOVERY` | Recovery protocol nudges | 12h |
| `DEVELOPMENT` | Skill/test recommendations | 7d |
| `ACADEMIC` | Study plan recommendations | 7d |
| `CV_OPPORTUNITY` | Recruiting/profile opportunities | 14d |
| `TRIANGLE_ALERT` | Multi-role alerts (coach/parent) | 24h |
| `MOTIVATION` | Celebration/encouragement | 48h |
| `JOURNAL_NUDGE` | Pre/post-session journal reminders | 12h |

### Event-Triggered Recommendations (Real-Time, $0)

```
emitEventSafe() → processEvent() → handler → writeSnapshot()
  → triggerRecommendationComputation()
    → Map event type → affected rec types
    → Generate deterministic recs based on snapshot data
    → Store in athlete_recommendations

# Example: WELLNESS_CHECKIN → ['READINESS', 'RECOVERY']
# Fast-path: Stale checkin → P1, RED → P1 Recovery, ACWR >1.5 → P1 Critical
```

### Deep Rec Refresh (Claude-Powered)

```
Trigger: Own It page visit (if stale >12h) or manual refresh (force=true)
Model: Claude Sonnet (~$0.01 per refresh)
Input: Full PlayerContext (10 parallel fetches)
Output: 4-6 DIVERSE, ACTIONABLE recommendations
Coverage: 12 aspects (training, study, testing, vitals, metrics, program,
          recovery, readiness, load, academic balance, CV, motivation)
Storage: athlete_recommendations (supersedes only DEEP_REFRESH recs)
```

### Deep Program Refresh (Claude-Powered)

```
Trigger: Program tab visit (if stale >24h) or after test/readiness changes
Model: Claude Sonnet (~$0.01 per refresh)
Input: PlayerContext + benchmark profile + PHV stage + 31-program catalog
Output: 8-15 ranked programs with personalized impact statements
Storage: athlete_snapshots.program_recommendations (24h TTL)
```

### Program Guardrails (8 Deterministic Rules)

Applied AFTER AI selection, BEFORE delivery:

| Rule | Trigger | Action |
|------|---------|--------|
| ACWR Load Gate | ACWR > 1.5 | Cap program load to 0.7x |
| HRV Recovery | HRV < 85% baseline + low sleep | Recommend light-only |
| PHV Safety | Pre-peak growth athletes | Avoid max-strength programs |
| Dual Load | Exam period active | Reduce training intensity cap |
| ... | ... | ... |

### Rec Decay Engine

```
Confidence score decays over time
→ Recs become less confident as they age
→ Auto-superseded/expired when confidence drops below threshold
```

---

## 15. Schedule Rule Engine

### Location

`backend/services/scheduling/scheduleRuleEngine.ts` — Single source of truth for ALL scheduling logic. Pure functions, no DB/React deps. Runs identically on frontend + backend.

### Player Schedule Preferences

```typescript
interface PlayerSchedulePreferences {
  // School
  school_days: DayOfWeek[];         // 0=Sun..6=Sat
  school_start: string;             // HH:MM
  school_end: string;

  // Sleep
  sleep_start: string;              // Bedtime, e.g., "22:00"
  sleep_end: string;                // Wake time, e.g., "06:00"
  day_bounds_start: string;
  day_bounds_end: string;

  // Training
  gym_days: DayOfWeek[];
  gym_start: string;
  gym_duration_min: number;
  club_days: DayOfWeek[];

  // Study
  study_days: DayOfWeek[];
  study_duration_min: number;
  exam_subjects: string[];
  exam_start_date: string | null;
  pre_exam_study_weeks: number;

  // Buffers
  buffer_default_min: number;
  buffer_post_match_min: number;

  // Scenario flags
  league_is_active: boolean;
  exam_period_active: boolean;
}
```

### 4 Scenarios

| Scenario | Modifiers |
|----------|-----------|
| `normal` | Standard priority rules |
| `league_active` | Match days take priority, no hard training 2 days before match |
| `exam_period` | Study blocks compress, training intensity capped |
| `league_and_exam` | Both modifiers combined |

Detection: `detectScenario(prefs)` → automatic based on flags

### AI System Prompt Injection

```typescript
// buildRuleContext(preferences, scenario) → text block for AI system prompt

// Contains:
// - Weekly schedule boundaries + day types
// - Training intensity caps per day
// - Exam study distribution
// - Buffer windows + fairness constraints
// - Scenario-specific guidance
// - Reference template: what a "correct" week looks like
```

### Key Exports

| Function | Purpose |
|----------|---------|
| `getEffectiveRules(prefs)` | Merge master + scenario + player prefs → typed config |
| `buildRuleContext()` | Generate text block for AI prompt injection |
| `buildExamStudyBlocks()` | Produce study event proposals for exam prep |
| `buildRichModeContext()` | Richer prompt: mode name, coaching tone, balance ratio |
| `detectScenario(prefs)` | Determine active scenario from preference flags |

---

## 16. Event Pipeline & Snapshot

### Event Types (28 Total)

| Category | Event Type | Description |
|----------|-----------|-------------|
| **Biometric** | `VITAL_READING` | HRV, resting HR, SpO2, skin temp |
| | `WEARABLE_SYNC` | Bulk device sync |
| | `SLEEP_RECORD` | Duration, quality, deep/REM/light/awake |
| **Training** | `SESSION_LOG` | Completed session: RPE, duration, load AU |
| | `DRILL_COMPLETED` | Drill ID, score, duration |
| | `SESSION_SKIPPED` | Missed session with reason |
| | `INTRA_SESSION_ADAPT` | Mid-session intensity adjustment |
| **Wellness** | `WELLNESS_CHECKIN` | Daily: energy, soreness, sleep, mood, pain, academic stress |
| | `INJURY_FLAG` | Location, severity, reporter |
| | `INJURY_CLEARED` | Linked to original, clearance notes |
| **Academic** | `ACADEMIC_EVENT` | Exam, assignment, presentation |
| | `STUDY_SESSION_LOG` | Subject, duration, quality |
| | `ACADEMIC_STRESS_FLAG` | High stress signal |
| **Assessment** | `ASSESSMENT_RESULT` | Test result with percentile + zone |
| | `PHV_MEASUREMENT` | Height, weight, sitting height → PHV recompute |
| | `MILESTONE_HIT` | Achievement unlocked |
| **Stakeholder** | `COACH_NOTE` | Coach observation |
| | `COACH_ASSESSMENT` | Formal assessment with scores |
| | `PARENT_INPUT` | Academic load, schedule conflict |
| | `TRIANGLE_FLAG` | Multi-role alert |
| **CV/Recruiting** | `COMPETITION_RESULT` | Match result, opponent, stats |
| | `CLUB_VIEW` | CV viewed by external |
| | `CV_EXPORTED` | CV shared (PDF/link/QR) |
| **Journal** | `JOURNAL_PRE_SESSION` | Pre-training target + focus |
| | `JOURNAL_POST_SESSION` | Post-training reflection + outcome |

### Event Structure

```typescript
interface AthleteEvent {
  event_id: string;
  athlete_id: string;
  event_type: EventType;           // One of 28 types
  occurred_at: string;             // ISO8601 — WHEN it happened
  source: 'WEARABLE' | 'MANUAL' | 'SYSTEM' | 'COACH' | 'PARENT';
  payload: EventPayload;           // Type-specific data
  created_by: string;
  created_at: string;
  correction_of: string | null;    // Audit trail for corrections
}
```

### Processing Pipeline

```
emitEventSafe()                          — Validate + INSERT into athlete_events
    ↓
processEvent()                           — Route by event_type to handler
    ├── wellnessHandler                  — Compute readiness, wellness trend
    ├── sessionHandler                   — Compute load, ACWR, dual load
    ├── academicHandler                  — Compute academic load
    ├── journalHandler                   — Compute completeness, streak
    ├── assessmentHandler                — Store results, update benchmarks
    ├── vitalHandler                     — Update HRV baseline, resting HR
    ├── drillHandler                     — Update mastery scores
    ├── competitionHandler               — Update CV, mastery
    └── ...
    ↓
writeSnapshot()                          — UPSERT to athlete_snapshots
    ↓ (fire-and-forget, non-blocking)
    ├── triggerRecommendationComputation()   — Layer 4 RIE
    ├── triggerDeepProgramRefreshAsync()     — AI programs (if stale)
    ├── evaluatePDILForEvent()              — Protocol evaluation
    ├── processDataEvent()                  — Notification triggers
    └── triggerSnapshotNotifications()      — Alert checks
```

### Snapshot (107 Fields)

Single denormalized row per athlete in `athlete_snapshots`, updated after EVERY event.

| Group | Fields | Count |
|-------|--------|-------|
| Identity | `athlete_id`, `snapshot_at`, `dob` | 3 |
| Profile | `sport`, `position`, `academic_year` | 3 |
| Anthropometrics | `height_cm`, `weight_kg`, `phv_stage`, `phv_offset_years` | 4 |
| Readiness | `readiness_score`, `readiness_rag`, `hrv_baseline_ms`, `hrv_today_ms`, `resting_hr_bpm`, `sleep_quality` | 6 |
| Load | `acwr`, `atl_7day`, `ctl_28day`, `dual_load_index`, `academic_load_7day`, `athletic_load_7day`, `injury_risk_flag` | 7 |
| Performance/CV | `sessions_total`, `training_age_weeks`, `streak_days`, `cv_completeness`, `mastery_scores`, `strength_benchmarks`, `speed_profile` | 8 |
| Wellness | `wellness_7day_avg`, `wellness_trend`, `triangle_rag` | 3 |
| Journal | `journal_completeness_7d`, `journal_streak_days`, `target_achievement_rate_30d`, etc. | 6 |
| Meta | `last_event_id`, `last_session_at`, `last_checkin_at` | 3 |
| + Enriched | Chat engagement, compliance, CV stats, benchmarks, academic, drill/program stats | ~67 |

### Reading Snapshots

```typescript
readSnapshot(athleteId, role) → O(1) read, role-based field filtering
readMultipleSnapshots(athleteIds[], role) → Coach dashboard bulk read
```

### Periodic Enrichment

Runs every 15 minutes, computes expensive/slow fields:
- Chat engagement (7d session/message counts)
- Compliance metrics (rec action rate, plan compliance)
- CV stats (views, statement status)
- Benchmark data (overall percentile, strengths)
- Triangle engagement (coach/parent recency)
- Academic metrics (study hours, exam count)
- Drill/program stats

---

## 17. Session Management

### Tables

| Table | Fields |
|-------|--------|
| `chat_sessions` | id, user_id, title, pending_action, active_agent, conversation_state, ended_at |
| `chat_messages` | id, session_id, user_id, role, content, structured, agent, token_count, created_at |

### Key Functions

| Function | Purpose |
|----------|---------|
| `getOrCreateSession(userId, sessionId?)` | Create fresh or reuse existing (never reuse stale) |
| `saveMessage(sessionId, role, content, options?)` | Store message + auto-title on first message |
| `loadSessionHistory(sessionId)` | Token-budgeted retrieval (5K token budget) |
| `savePendingAction(sessionId, action)` | Store action awaiting confirmation (60-min TTL) |
| `getPendingAction(sessionId)` | Retrieve + check expiry |
| `isAffirmation(message)` | Detect "yes", "okay", "do it", "confirm", "sounds good" |

### History Loading Strategy

```
Token budget: 5000 tokens (~20KB text)

1. Load all messages for session
2. Keep last 6 turns verbatim
3. Older messages → deterministic compression:
   "[Session summary]: Topics discussed: readiness, scheduling..."
   (Extracts topics, actions, key data points — no LLM cost)
4. Safety cap: if >20K chars after budget, trim to last 4 messages
```

### Conversation State Tracking

Deterministic extraction (no LLM), persisted to `chat_sessions.conversation_state`:

```typescript
interface ConversationState {
  currentTopic: string | null;
  referencedDates: { date_key: "YYYY-MM-DD" };
  referencedEventIds: string[];        // UUIDs from assistant responses (last 20)
  referencedEventNames: string[];      // Event titles mentioned (last 20)
  referencedDrills: { drill_name: drillId };
  lastActionContext: string | null;
  entityGraph: {
    entities: [{ type, value, id, turnIndex }];
    lastMentioned: { type: value };    // For pronoun resolution ("that one", "it")
    turnCount: number;
  };
}
```

---

## 18. Cost Architecture

### Per-Layer Cost Breakdown

| Layer | Cost | Latency | Coverage |
|-------|------|---------|----------|
| Exact match | $0 | <1ms | ~40% of queries |
| Haiku classifier | ~$0.0001 | <200ms | ~30% of queries |
| Haiku agent (reads) | ~$0.0005 | <800ms | ~15% of queries |
| Sonnet agent (writes) | ~$0.005-0.02 | 1-3s | ~15% of queries |
| RAG retrieval | ~$0.003 | <500ms | Advisory queries only |
| Memory update | ~$0.0002 | fire-and-forget | Sessions with 5+ turns |
| Deep rec refresh | ~$0.01 | fire-and-forget | On-demand from Own It |
| Deep program refresh | ~$0.01 | fire-and-forget | On-demand from programs |
| Prompt caching | 50-70% hit rate | saves ~30% latency | Static block |

### Model Pricing

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| Haiku 4.5 | $0.80/MTok | $4.00/MTok | $0.08/MTok | $1.00/MTok |
| Sonnet 4 | $3.00/MTok | $15.00/MTok | $0.30/MTok | $3.75/MTok |

### Telemetry

All API calls wrapped in `trackedClaudeCall()`:

```typescript
// Returns: { message, telemetry }
// telemetry: { model, costUsd, tokens, latencyMs, cacheReadTokens }

// Fire-and-forget to api_usage_log table:
// user_id, session_id, agent_type, model, input/output tokens,
// cache metrics, estimated_cost_usd, latency_ms, classification_layer, intent_id
```

### Model Routing

| Route to Sonnet | Route to Haiku |
|-----------------|----------------|
| Multi-agent routing (2+ agents) | Single-agent, read-only queries |
| Calendar writes with conflict detection | Simple schedule checks |
| Multi-turn with active date context | Single drill detail |
| Explicit planning ("plan my week") | Quick readiness lookup |
| Session generation + full workout | Test logging |
| Benchmark comparisons | Affirmations |
| PHV calculations | — |

**Current default**: Haiku 4.5 for agent_dispatch (cost optimization).

---

## 19. Complete File Reference

### Backend — API Routes

| File | Purpose |
|------|---------|
| `backend/app/api/v1/chat/agent/route.ts` | Main chat endpoint |
| `backend/app/api/v1/chat/agent-stream/route.ts` | Streaming SSE variant |
| `backend/app/api/v1/chat/send/route.ts` | Legacy chat endpoint |
| `backend/app/api/v1/chat/sessions/route.ts` | Session CRUD |
| `backend/app/api/v1/chat/suggestions/route.ts` | Dynamic suggestion chips |
| `backend/app/api/v1/chat/briefing/route.ts` | Daily briefing |
| `backend/app/api/v1/chat/transcribe/route.ts` | Voice transcription |

### Backend — Agent System (TypeScript)

| File | Purpose |
|------|---------|
| `backend/services/agents/aiServiceProxy.ts` | Python AI service proxy (stream + sync) |
| `backend/services/agents/contextBuilder.ts` | PlayerContext (14 parallel queries) |
| `backend/services/agents/chatGuardrails.ts` | Pre-flight safety + post-response filters |
| `backend/services/agents/sessionService.ts` | Session lifecycle, history budget, pending actions |
| `backend/services/agents/longitudinalMemory.ts` | Cross-session athlete memory |
| `backend/services/agents/outputAgent.ts` | 22 readiness/test/drill tool executors |
| `backend/services/agents/timelineAgent.ts` | 17 calendar tool executors |
| `backend/services/agents/masteryAgent.ts` | 7 progress/CV tool executors |
| `backend/services/agents/settingsAgent.ts` | Profile/notification tool executors |
| `backend/services/agents/intentRegistry.ts` | 45 intent definitions |
| `backend/services/agents/intentClassifier.ts` | 3-layer classifier |
| `backend/services/agents/intentHandlers.ts` | 45 fast-path handlers |
| `backend/services/agents/orchestrator.ts` | Agent routing, system prompt, confirmation gate |
| `backend/services/agents/conversationStateExtractor.ts` | 7-field state extraction |
| `backend/services/agents/responseFormatter.ts` | Card types + formatting rules |
| `backend/lib/trackedClaudeCall.ts` | API usage telemetry wrapper |

### Python AI Service — LangGraph

| File | Purpose |
|------|---------|
| `ai-service/app/graph/supervisor.py` | LangGraph StateGraph (8 nodes) |
| `ai-service/app/graph/nodes/context_assembly.py` | 11 parallel DB queries → PlayerContext |
| `ai-service/app/graph/nodes/rag_retrieval.py` | Hybrid 5-signal knowledge retrieval |
| `ai-service/app/graph/nodes/pre_router.py` | Intent classify + agent route |
| `ai-service/app/graph/nodes/agent_dispatch.py` | Agentic tool-calling loop (max 5 iter) |
| `ai-service/app/graph/nodes/validate.py` | PHV safety hard gate + tone validation |
| `ai-service/app/graph/nodes/format_response.py` | Raw text → structured cards |
| `ai-service/app/graph/nodes/persist.py` | Zep memory + longitudinal extraction |
| `ai-service/app/graph/nodes/aib_generator.py` | Athlete Intelligence Brief generator |
| `ai-service/app/graph/conversation_history.py` | Token-budgeted history loading |
| `ai-service/app/graph/observability.py` | LangSmith telemetry |
| `ai-service/app/models/state.py` | TomoChatState TypedDict |
| `ai-service/app/models/context.py` | PlayerContext Pydantic model |

### Python AI Service — Agents & Tools

| File | Purpose |
|------|---------|
| `ai-service/app/agents/tools/__init__.py` | Tool registry (get_tools_for_agent) |
| `ai-service/app/agents/tools/output_tools.py` | Output agent tool factories |
| `ai-service/app/agents/tools/timeline_tools.py` | Timeline agent tool factories |
| `ai-service/app/agents/tools/mastery_tools.py` | Mastery agent tool factories |
| `ai-service/app/agents/tools/settings_tools.py` | Settings agent tool factories |
| `ai-service/app/agents/tools/planning_tools.py` | Planning agent tool factories |
| `ai-service/app/agents/tools/bridge.py` | HTTP bridge to TS backend for writes |
| `ai-service/app/agents/prompt_builder.py` | 2-block system prompt builder |
| `ai-service/app/agents/intent_classifier.py` | 3-layer intent classification |
| `ai-service/app/agents/intent_registry.py` | Intent definitions + capsule mappings |
| `ai-service/app/agents/router.py` | 5-way agent router |
| `ai-service/app/agents/greeting_handler.py` | Greeting energy tier detection |

### Python AI Service — RAG

| File | Purpose |
|------|---------|
| `ai-service/app/rag/retriever.py` | Hybrid 5-signal retriever |
| `ai-service/app/rag/embedder.py` | Voyage AI embedding generation |
| `ai-service/app/rag/reranker.py` | Cohere v3.5 + state-aware boosting |
| `ai-service/app/rag/sub_question.py` | Complex query decomposition |
| `ai-service/app/rag/graph_store.py` | Entity graph traversal |
| `ai-service/app/rag/models.py` | Retrieval result models |

### Python AI Service — Memory

| File | Purpose |
|------|---------|
| `ai-service/app/services/memory_service.py` | 4-tier memory orchestration |
| `ai-service/app/services/zep_client.py` | Zep session/fact storage |

### Backend — Intelligence Services

| File | Purpose |
|------|---------|
| `backend/services/scheduling/scheduleRuleEngine.ts` | Priority rules, buffers, scenarios |
| `backend/services/schedulingEngine.ts` | Slot finding, conflict detection |
| `backend/services/recommendations/deepRecRefresh.ts` | Claude-powered holistic recs |
| `backend/services/recommendations/constants.ts` | Event routing + expiry config |
| `backend/services/recommendations/types.ts` | Rec type definitions |
| `backend/services/recommendations/recommendationConfig.ts` | CMS-driven config |
| `backend/services/recommendations/recDecayEngine.ts` | Confidence decay |
| `backend/services/recommendations/supersedeExisting.ts` | Supersession logic |
| `backend/services/programs/deepProgramRefresh.ts` | Claude-powered program selection |
| `backend/services/programs/programGuardrails.ts` | 8 deterministic safety rules |
| `backend/services/programs/footballPrograms.ts` | 31-program catalog |
| `backend/services/programs/programRules/` | CMS rule evaluation |
| `backend/services/programs/anthropometricLoadModifier.ts` | Height/weight load adjustments |
| `backend/services/drillRecommendationService.ts` | Drill scoring + readiness filtering |

### Backend — Event Pipeline & Snapshot

| File | Purpose |
|------|---------|
| `backend/services/events/eventEmitter.ts` | Entry point (emitEventSafe) |
| `backend/services/events/eventProcessor.ts` | Router + handler dispatch |
| `backend/services/events/snapshot/snapshotWriter.ts` | Atomic snapshot update |
| `backend/services/events/snapshot/snapshotReader.ts` | O(1) role-based reads |
| `backend/services/events/handlers/` | Per-type event handlers |
| `backend/services/snapshot/enrichSnapshotPeriodic.ts` | 15-min periodic enrichment |
| `backend/services/programs/snapshotFieldRegistry.ts` | Field registry |

### Mobile — Chat UI

| File | Purpose |
|------|---------|
| `mobile/src/screens/HomeScreen.tsx` | Main chat screen (Tomo Chat tab) |
| `mobile/src/components/chat/ResponseRenderer.tsx` | 15 visual card renderers |
| `mobile/src/components/chat/capsules/CapsuleRenderer.tsx` | 30 capsule dispatcher |
| `mobile/src/components/chat/capsules/*.tsx` | Individual capsule components |
| `mobile/src/components/chat/ProactiveDashboard.tsx` | Proactive suggestions |
| `mobile/src/services/api.ts` | API client (sendAgentChatMessage*, stream) |
| `mobile/src/utils/refreshBus.ts` | Cross-screen event system |
| `mobile/src/types/chat.ts` | TomoResponse, ChatSession, ConfirmAction types |

### Existing Documentation

| File | Content |
|------|---------|
| `docs/AI_CHAT_DOCUMENTATION.md` | Chat architecture reference (24KB) |
| `docs/TOMO_UNIFIED_ARCHITECTURE.md` | Complete system blueprint (41KB) |
| `docs/TOMO_AI_ARCHITECTURE_10_PHASES.md` | 10-phase implementation reference (49KB) |
| `docs/SNAPSHOT_360_ENHANCEMENT.md` | Snapshot enrichment deep dive (14KB) |
| `docs/PERFORMANCE_INTELLIGENCE_HUB.md` | PDIL protocol engine (20KB) |
| `docs/UNIFIED_DATA_LAYER_ARCHITECTURE.md` | Data fabric layers 1-5 (24KB) |

---

## 20. Extension Points for New Agents

This section describes exactly how to add a new specialized agent to the Tomo system.

### Step 1: Define Tools (Python)

Create a new tool factory file:

```python
# ai-service/app/agents/tools/my_new_agent_tools.py

from langchain_core.tools import tool
from app.models.context import PlayerContext

def make_my_new_agent_tools(user_id: str, context: PlayerContext) -> list:
    @tool
    async def my_read_tool(query: str) -> dict:
        """Description for LLM to understand when to use this tool."""
        # Read from Supabase directly (psycopg3)
        ...

    @tool
    async def my_write_tool(data: dict) -> dict:
        """Description for write operation."""
        # Proxy to TS backend via bridge_post()
        from app.agents.tools.bridge import bridge_post
        return await bridge_post("/api/v1/my-endpoint", data, user_id)

    return [my_read_tool, my_write_tool]
```

### Step 2: Register in Tool Factory

```python
# ai-service/app/agents/tools/__init__.py

from app.agents.tools.my_new_agent_tools import make_my_new_agent_tools

TOOL_FACTORIES = {
    "output": make_output_tools,
    "timeline": make_timeline_tools,
    "mastery": make_mastery_tools,
    "settings": make_settings_tools,
    "planning": make_planning_tools,
    "my_new_agent": make_my_new_agent_tools,  # ADD
}
```

### Step 3: Add Agent Type to State

```python
# ai-service/app/models/state.py

selected_agent: Optional[str]  # Add "my_new_agent" to valid values
```

### Step 4: Add Routing Rules

```python
# ai-service/app/agents/router.py

# Add routing signals for your agent:
# - Keywords that should route to your agent
# - Active tab mapping (if agent owns a tab)
```

### Step 5: Register Intents

```python
# ai-service/app/agents/intent_registry.py

# Add intents that trigger your agent:
# - Exact match phrases for Layer 1
# - Agent type mapping for Layer 2 classifier
# - Capsule type mappings (if your agent has capsules)
```

### Step 6: Add System Prompt Section

```python
# ai-service/app/agents/prompt_builder.py

# Add agent-specific static prompt block:
AGENT_STATIC_PROMPTS = {
    ...
    "my_new_agent": "You are specializing in [domain]. Your tools: ...",
}

# Add agent-specific dynamic context generation:
def _build_dynamic_for_my_agent(context: PlayerContext) -> str:
    # Return dynamic prompt section based on athlete context
    ...
```

### Step 7: Add TS-Side Tool Executors (for Capsule Fast-Path)

```typescript
// backend/services/agents/myNewAgent.ts

export async function executeMyNewAgentTool(
    toolName: string,
    toolInput: Record<string, any>,
    context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
    switch (toolName) {
        case "my_write_tool":
            // Execute directly, trigger event pipeline
            await emitEventSafe({...});
            return { result: "Done", refreshTarget: "output" };
    }
}
```

### Step 8: Add Write Action Registration

```python
# ai-service/app/agents/tools/bridge.py

# If your agent has write tools, add them to:
WRITE_ACTIONS.add("my_write_tool")
# And optionally to CAPSULE_DIRECT_ACTIONS or CAPSULE_GATED_ACTIONS
```

### Step 9: Add Mobile Capsule (if needed)

```
mobile/src/components/chat/capsules/MyNewCapsule.tsx
→ Register in CapsuleRenderer.tsx dispatch switch
```

### Architecture Patterns to Follow

1. **Read from Snapshot**: Always `readSnapshot()` for O(1) reads, never raw tables
2. **Write through Events**: Always `emitEventSafe()` for data mutations → event pipeline fires correctly
3. **Refresh Bus**: Return `refreshTargets` so mobile screens update in real-time
4. **Safety**: Check `injuryRiskFlag` and `phvStage` before recommending intensity
5. **Cost**: Use deterministic fast-paths ($0) where possible, Haiku for reads, Sonnet for complex writes
6. **Telemetry**: All Claude calls through `trackedClaudeCall()` for cost tracking
7. **Confirmation**: All write actions require user confirmation (ConfirmationCard)

---

## Appendix: Interconnection Map

```
USER MESSAGE
    ↓
┌─ CAPSULE FAST-PATH ($0, ~60-70% traffic)
│  Resolved directly in TS backend (no AI call)
│
└─ AI CALL (~30-40% traffic) → Python AI Service
   │
   ├─ CONTEXT ASSEMBLY (14 parallel queries, <1000ms)
   │  ├─ readSnapshot() [Layer 2]
   │  ├─ getRecommendations() [Layer 4]
   │  └─ buildPlayerContext() [Layer 3]
   │
   ├─ RAG RETRIEVAL (hybrid 5-signal, <500ms)
   │  ├─ embed_query() [Voyage AI, $0.0001]
   │  ├─ search + traverse + rerank
   │  └─ Returns: rag_context + rag_metadata
   │
   ├─ SYSTEM PROMPT ASSEMBLY
   │  ├─ Static: coaching identity + format rules
   │  ├─ + PlayerContext fields
   │  ├─ + buildRuleContext() [schedule rules]
   │  ├─ + loadAthleteMemory() [longitudinal]
   │  ├─ + rag_context [knowledge]
   │  ├─ + active_recommendations
   │  └─ + conversation history
   │
   ├─ AGENT DISPATCH (Haiku 4.5)
   │  ├─ Router → Output / Timeline / Mastery / Settings / Planning
   │  ├─ Tool calling loop (0-5 iterations)
   │  ├─ Write detection → PendingWriteAction → ConfirmationCard
   │  └─ Response → validate → format → persist
   │
   ├─ PERSIST (non-blocking)
   │  ├─ Save to Zep session
   │  └─ After 5+ turns: updateAthleteMemory() [Haiku, $0.0002]
   │
   └─ RETURN via SSE stream → mobile renders cards + capsules

BACKGROUND PROCESSES (fire-and-forget):
├─ emitEventSafe() → processEvent() → handler
├─ writeSnapshot() → downstream triggers:
│  ├─ computeRecommendations() [Layer 4]
│  ├─ deepProgramRefresh() (if stale >24h)
│  ├─ evaluatePDIL() [Layer 5]
│  ├─ enrichSnapshotPeriodic() (every 15 min)
│  └─ triggerNotifications()
└─ deepRecRefresh() (Sonnet, $0.01) on-demand from Own It
```

---

*End of export. This document is self-contained and covers the complete Tomo AI architecture as of April 12, 2026.*
