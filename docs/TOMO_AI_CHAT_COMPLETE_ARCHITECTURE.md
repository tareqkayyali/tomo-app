# Tomo AI Chat — Complete System Architecture

> **Version**: 2.0 — April 13, 2026
> **Scope**: Full pipeline dump — every node, agent, tool, prompt block, intent pattern, state field, and wiring detail
> **Audience**: Engineering reference, agent design, debugging, onboarding

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [End-to-End Message Flow](#2-end-to-end-message-flow)
3. [LangGraph Supervisor Pipeline](#3-langgraph-supervisor-pipeline)
4. [Node-by-Node Reference](#4-node-by-node-reference)
5. [3-Layer Intent Classification](#5-3-layer-intent-classification)
6. [Agent Router & Tiebreaker Logic](#6-agent-router--tiebreaker-logic)
7. [Complete Intent Registry (90+ Intents)](#7-complete-intent-registry)
8. [10-Agent System & 93 Tools](#8-10-agent-system--93-tools)
9. [System Prompt Architecture (2-Block Caching)](#9-system-prompt-architecture)
10. [RAG Knowledge System](#10-rag-knowledge-system)
11. [Conversation History & Memory](#11-conversation-history--memory)
12. [Write Action Confirmation Flow](#12-write-action-confirmation-flow)
13. [TypeScript Backend Bridge](#13-typescript-backend-bridge)
14. [Validation & Safety Layers](#14-validation--safety-layers)
15. [Response Formatting (Pulse Post-Processing)](#15-response-formatting)
16. [Persistence & Observability](#16-persistence--observability)
17. [State Model (TomoChatState)](#17-state-model)
18. [Configuration & Environment](#18-configuration--environment)
19. [TypeScript Gateway (agent-stream)](#19-typescript-gateway)
20. [Mobile Chat Integration](#20-mobile-chat-integration)
21. [Cost Architecture](#21-cost-architecture)
22. [Critical Thresholds & Constants](#22-critical-thresholds--constants)
23. [Complete File Reference](#23-complete-file-reference)

---

## 1. System Overview

Tomo AI Chat is a **LangGraph-based multi-agent coaching system** serving personalized athletic coaching to young athletes (ages 13-25). The system runs as a Python FastAPI microservice on Railway's private network, receiving all chat traffic from the TypeScript Next.js backend.

### Dual-Layer Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| **TypeScript Backend** | Next.js 16, Railway | Auth gateway, session management, capsule tool execution (button presses), SSE proxy, event pipeline |
| **Python AI Service** | FastAPI, LangGraph, Railway (internal) | 100% of AI orchestration: intent classification, agent dispatch, RAG retrieval, prompt assembly, validation, formatting |

### Key Numbers

| Metric | Value |
|--------|-------|
| Agents | 10 specialized |
| Tools | 93 total (57 read, 36 write) |
| Intent patterns | 150+ exact match, 90+ registry entries |
| Graph nodes | 8 (+ 1 conditional) |
| LLM model | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Avg cost/turn | ~$0.003 |
| Avg latency | ~4-5s end-to-end |

---

## 2. End-to-End Message Flow

```
Mobile App (Expo/RN)
  │  POST /api/v1/chat/agent-stream  { message, sessionId, activeTab, timezone }
  ▼
TypeScript Backend (Next.js)
  │  1. Auth check (Bearer token)
  │  2. Rate limit (20 req/min)
  │  3. Session management (getOrCreateSession, saveMessage)
  │  4. Capsule action check (button presses → execute locally, $0)
  │  5. If not capsule → proxy to Python
  ▼
Python AI Service (FastAPI)
  │  POST /chat  { message, session_id, player_id, active_tab, timezone }
  │  Returns: SSE stream (event: status → event: done | event: error)
  ▼
LangGraph Supervisor
  │  context_assembly → pre_router → [capsule|confirm|rag→agent] → validate → format → persist
  ▼
SSE Response → TypeScript → Mobile
  │  { message, structured: {headline, body, cards[], chips[]}, sessionId, refreshTargets }
```

### SSE Event Format

```
event: status
data: {"status": "Thinking..."}

event: done
data: {"message": "...", "structured": {...}, "sessionId": "...", "refreshTargets": [...], "pendingConfirmation": null, "context": {...}, "_telemetry": {...}}

event: error
data: {"error": "...", "message": "Something tripped up on my end -- mind trying that again?"}
```

---

## 3. LangGraph Supervisor Pipeline

**File**: `ai-service/app/graph/supervisor.py`

### Graph Definition

```
START
  │
  ▼
context_assembly ─── (11+ parallel DB queries → PlayerContext)
  │
  ▼
pre_router ─── (3-layer intent classify + agent route)
  │
  ├──→ capsule ──────────────────────→ format_response → persist → END
  │                                          (disabled in v1)
  ├──→ confirm → execute_confirmed ──→ validate → format_response → persist → END
  │                                          (user confirmed write action)
  └──→ ai → rag_retrieval → agent_dispatch → validate → format_response → persist → END
              (full pipeline)
```

### Conditional Routing

**`route_after_pre_router(state)`** — returns `"capsule" | "confirm" | "ai"`

- `"capsule"`: Fast-path (currently DISABLED — all routes through `"ai"`)
- `"confirm"`: `write_confirmed=True` and `pending_write_action` exists
- `"ai"`: Full pipeline with RAG + agent dispatch (default)

### Invocation

```python
result = await run_supervisor(
    user_id="uid_xxx",
    session_id="sess_yyy",
    message="What's my readiness?",
    active_tab="Chat",
    timezone="US/Eastern",
    confirmed_action=None,  # or {actions: [...]} for write confirmations
)
# Returns: dict with final_response, final_cards, total_cost_usd, total_tokens, etc.
```

---

## 4. Node-by-Node Reference

### 4.1 context_assembly

**File**: `ai-service/app/graph/nodes/context_assembly.py`

Assembles complete PlayerContext via 15 parallel Supabase queries. Target: <800ms.

**Parallel Queries**:

| # | Query | Returns |
|---|-------|---------|
| 1 | `_fetch_profile()` | name, sport, age, age_band, role, streaks |
| 2 | `_fetch_today_events()` | calendar events in local timezone |
| 3 | `_fetch_latest_checkin()` | energy, mood, sleep, soreness, pain |
| 4 | `_fetch_recent_vitals()` | 3-day HRV, sleep, SpO2 |
| 5 | `_fetch_upcoming_exams()` | exams in next 14 days |
| 6 | `_fetch_phone_tests()` | recent phone test sessions |
| 7 | `_fetch_football_tests()` | sport-specific test results |
| 8 | `_fetch_schedule_prefs()` | league mode, exam period, rules |
| 9 | `_fetch_snapshot()` | athlete_snapshots (CCRS, ACWR, injury risk, 90+ enriched fields) |
| 10 | `_fetch_projected_load()` | sum of estimated_load_au next 7 days |
| 11 | `_fetch_upcoming_events()` | all events in next 7 days |
| 12 | `_fetch_recommendations()` | top 5 active recs |
| 13 | `_fetch_pd_protocols()` | enabled PDIL protocols |
| 14 | `_fetch_wearable_status()` | WHOOP connection + sync status |
| 15 | `_fetch_aib()` | latest Athlete Intelligence Brief summary |

**State writes**: `player_context` (PlayerContext), `aib_summary` (str)

**Graceful degradation**: Every query wrapped in try/except. Missing data = None, chat continues.

---

### 4.2 pre_router

**File**: `ai-service/app/graph/nodes/pre_router.py`

Bridges 3-layer intent classifier + agent router. Determines routing for the entire request.

**Flow**:
1. Extract last human message
2. Run 3-layer intent classifier (`classify_intent()`)
3. Run agent router (`route_to_agents()`)
4. Apply agent lock for conversation continuity
5. Check for safety override (RED risk)
6. Return routing decision

**Confidence threshold**: When classifier confidence >= 0.8 (exact match always returns 1.0), pre_router uses the classifier's `agent_type` directly, overriding the router tiebreaker. This means exact match patterns MUST point to the correct agent.

**Agent lock**: `should_keep_agent_lock()` checks if user is continuing same topic. If lock holds, returns confidence 0.85 and bypasses classification.

**State writes**: `route_decision`, `selected_agent`, `routing_confidence`, `classification_layer`, `intent_id`, `capsule_type`, `_secondary_agents`, `_safety_override`

---

### 4.3 rag_retrieval

**File**: `ai-service/app/graph/nodes/rag_retrieval.py`

Retrieves sports science knowledge chunks before agent dispatch. Cost: ~$0.003/query.

**Skip logic** — these intents bypass RAG entirely:
```
greeting, navigate, qa_today_schedule, qa_week_schedule, qa_streak, qa_test_history,
log_test, check_in, log_nutrition, log_sleep, journal_pre, journal_post,
update_profile, schedule_rules, view_notifications, clear_notifications,
leaderboard, create_event, add_exam, plan_study, plan_regular_study
```

**Query reformulation** — 2-stage:
1. Intent-specific domain expansion (e.g., `qa_readiness` appends "athlete readiness training load management recovery protocol")
2. Synonym expansion (casual language → sports science terms: "tired" → "recovery fatigue readiness overtraining")

**Safety-critical intents** — logs WARNING if RAG returns empty:
```
qa_readiness, load_advice_request, recovery_guidance, injury_query, red_risk_override
```

**Retrieval**: `top_k=6`, Voyage AI embeddings (512-dim), Cohere reranking

**State writes**: `rag_context` (formatted text), `rag_metadata` (entity_count, chunk_count, hops, cost, latency), `total_cost_usd` (accumulated)

---

### 4.4 agent_dispatch

**File**: `ai-service/app/graph/nodes/agent_dispatch.py`

Core agentic execution engine. Runs Haiku in a loop calling tools, detecting write actions, halting for confirmation.

**LLM Config**:
- Model: `claude-haiku-4-5-20251001`
- Temperature: 0.3
- Max tokens: 4096
- Cost: $0.80/MTok input, $4.00/MTok output (cache reads free)

**Agentic Loop** (max 5 iterations):
1. Build 2-block system prompt (static cached + dynamic per-request)
2. Inject intent guidance + RAG context + memory + conversation bridge
3. Invoke Haiku with tools bound
4. Parse tool calls from response
5. **Write action detected?** → INTERRUPT — return pending action for confirmation
6. **Read-only tools?** → Execute, feed results back to LLM, continue loop
7. **No tool calls?** → Final response ready, exit loop

**Recovery mechanisms**:
- Tool failure cascade (>50% fail): inject recovery prompt forcing LLM to acknowledge
- Empty response: final LLM call without tools bound, forces text synthesis
- Conversation > 20K chars: trim to last 4 messages

**Context bridge injection** (multi-turn sessions):
```python
if len(all_state_msgs) > 1:
    dynamic_block = (
        "CONVERSATION CONTEXT: This is a continuing conversation. "
        "The athlete has already been chatting -- review message history "
        "for what they discussed and build on it naturally.\n\n"
        + dynamic_block
    )
```

**State writes**: `agent_response`, `tool_calls`, `messages`, `total_cost_usd`, `total_tokens`, `latency_ms`, `pending_write_action`

---

### 4.5 execute_confirmed

**File**: `ai-service/app/graph/nodes/agent_dispatch.py` (function: `execute_confirmed_action`)

Executes previously confirmed write actions after user approval.

**Critical**: Uses `action.agentType` (not `selected_agent`) to load correct tools, since pre_router may have classified the confirmation text to a different agent.

**Refresh targets** computed from tool names:
- `event/schedule` → `"calendar"`
- `check_in/readiness` → `"readiness"`, `"recommendations"`
- `program` → `"programs"`
- `test/journal` → `"metrics"`
- Every write → `"notifications"`

**Retry**: If ALL actions fail, `pending_write_action` preserved for re-confirmation.

---

### 4.6 validate

**File**: `ai-service/app/graph/nodes/validate.py`

All validation is **ADVISORY** — never blocks response.

**Layer 1: PHV Safety** — If player is in mid-PHV (growth phase), scans response for 11 contraindicated movement patterns (barbell squat, depth jump, Olympic lift, 1RM, etc.). Appends advisory warning.

**Layer 2: Tone Validation** — Scans for banned phrases ("great effort", "research shows that", "according to your data") and robotic patterns. Log only.

**Layer 3: Format Validation** — Checks for JSON structure, detects possible data fabrication patterns. Log only.

**State writes**: `agent_response` (may append PHV warning), `validation_passed` (always True), `validation_flags`

---

### 4.7 format_response

**File**: `ai-service/app/graph/nodes/format_response.py`

Parses agent response into structured `{headline, body, cards[], chips[]}`.

**JSON extraction** — 3-prong: fenced JSON → pure JSON → brace extraction → text_card fallback

**Pulse post-processing** (10 steps):
1. Strip emoji (zero emoji policy)
2. Strip markdown from body
3. Clean headlines (remove `#`, `**`, emoji)
4. Reorder cards (data cards first)
5. Truncate body to MAX_BODY_SENTENCES (currently 3)
6. Enforce max 2 chips
7. Sanitize stat_grid values (HRV ms → "Strong"/"Okay"/"Low", ACWR → "Building"/"Elevated")
8. Deduplicate text_card content matching body
9. Timeline enforcement (ensure schedule_list card exists for timeline agent)
10. Check-in pill (prepend "Check in" chip if no check-in today)

**Headline priority** — CCRS-based for safety headlines:
- `ccrs_recommendation in ("blocked", "recovery")` → "Recovery first today"
- `ccrs_recommendation == "reduced"` → "Ease off this week"
- Injury RED → "Recovery first today"

**Context stat_grid injection** — builds from player_context when LLM omits data cards:
- Readiness RAG (Green/Yellow/Red)
- Injury risk flag
- CCRS score (0-100)
- Data confidence (0-100%)

**State writes**: `final_response` (JSON string), `final_cards`

---

### 4.8 persist

**File**: `ai-service/app/graph/nodes/persist.py`

Non-blocking — failures never delay chat response.

**Saves**:
1. **chat_messages** (Supabase) — role, content, metadata (agent_type, cost, tokens, tools, flags)
2. **Zep memory** (fire-and-forget) — user message, assistant response, agent_type, turn_count
3. **ai_trace_log** (Supabase) — 51-column telemetry record

**Fallback**: If 51-column INSERT fails, tries core 38-column INSERT.

---

## 5. 3-Layer Intent Classification

**File**: `ai-service/app/agents/intent_classifier.py`

### Layer 1: Exact Match ($0, <1ms, confidence 1.0)

150+ normalized phrase patterns mapped to intent IDs. Message is lowercased and stripped before matching.

**Major pattern groups**:

| Category | Example Patterns | Intent | Agent |
|----------|-----------------|--------|-------|
| Greetings | "hey tomo", "hi", "good morning", "what's up" | `greeting` | output |
| Test logging | "log a test", "record my sprint" | `log_test` | testing_benchmark |
| Check-in | "check in", "daily check in", "wellness check" | `check_in` | output |
| Navigation | "go to timeline", "show output", "my vitals" | `navigate` | output |
| Readiness QA | "what's my readiness", "how am i doing" | `qa_readiness` | output |
| Training readiness | "can i train today", "am i ready to train", "start training" | `qa_readiness` | output |
| Today schedule | "today's schedule", "what's on today", "my agenda" | `qa_today_schedule` | timeline |
| Week schedule | "this week's schedule", "my week" | `qa_week_schedule` | timeline |
| Day planning | "plan my day", "let's plan today", "organize my day" | `qa_today_schedule` | timeline |
| Week planning | "plan my week", "organize my week" | `qa_week_schedule` | timeline |
| Events/sessions | "add event", "build a session", "schedule training" | `create_event` | timeline |
| Sport-specific sessions | "speed session", "gym session plan", "conditioning session" | `create_event` | timeline |
| Recovery | "do i need recovery", "should i rest today", "am i overtraining" | `load_advice_request` | output |
| Benchmarks | "benchmark my tests", "am i fast for my age", "percentile" | `benchmark_comparison` | testing_benchmark |
| Programs | "my programs", "recommended programs" | `show_programs` | output |
| Goals | "set a goal", "new goal" | `set_goal` | settings |
| Injury | "i'm injured", "injury mode" | `injury_mode` | settings |
| Exams | "add an exam", "new exam" | `add_exam` | timeline |
| Study | "plan my study", "study schedule" | `plan_study` | timeline |
| Streaks | "my streak", "current streak" | `qa_streak` | mastery |

### Layer 2: Haiku AI Classification (~$0.0001, ~200ms, confidence 0.65+)

Model: `claude-haiku-4-5-20251001`, temperature 0, max tokens 100.

**System prompt includes critical rules**:
1. Specific program BY NAME → `agent_fallthrough` (NOT `show_programs`)
2. Quoted recommendation → `agent_fallthrough` (NOT `qa_readiness`)
3. Pain/injury context → `agent_fallthrough` (NOT `qa_readiness`)
4. "start training", "can I train" → `qa_readiness` (readiness check FIRST)
5. Follow-up questions about previous response → `agent_fallthrough`

**Context boosts**: +0.1 confidence for currentTopic/lastActionContext match (max 1.0).

### Layer 3: Fallthrough Patterns (→ full AI orchestrator)

Regex patterns that force routing to full AI:
- Follow-ups: `^tell me more`, `^explain`, `^how do i`, `^can you elaborate`
- Continuations: `^okay`, `^no,`, `^yes,`, `^what about`, `^but `, `^also `
- Injury/pain: `\bpain\b`, `\binjured\b`, `\bhurt\b`
- Program specifics: `drills for my .+ program`
- Recommendation references: `my readiness says`

---

## 6. Agent Router & Tiebreaker Logic

**File**: `ai-service/app/agents/router.py`

When multiple agents match keyword patterns, 27 ordered tiebreaker rules resolve conflicts. First match wins.

### Tiebreaker Priority (ordered)

| Priority | Pattern | Winner |
|----------|---------|--------|
| 1 | `log\s+(?:my\s+)?(?:test\|sprint\|jump\|agility)` | testing_benchmark |
| 2 | `benchmark\|percentile\|compare.*(?:age\|peer)` | testing_benchmark |
| 3 | `combine\s*readiness\|scout\s*report` | testing_benchmark |
| 4 | `test\s*result\|test\s*(?:catalog\|battery)` | testing_benchmark |
| 5 | `sprint\s*\d+m\|cmj\|yoyo` | testing_benchmark |
| 6 | `deload\|overtraining\|over.?trained` | recovery |
| 7 | `recovery\s*(?:status\|plan\|week\|session)` | recovery |
| 8 | `tissue\s*load\|foam\s*roll\|ice\s*bath` | recovery |
| 9 | `dual.?load\|academic.*(?:stress\|balance\|load)` | dual_load |
| 10 | `exam.*(?:collision\|conflict)\|cognitive.*window` | dual_load |
| 11 | `integrated.*(?:plan\|week)` | dual_load |
| 12 | `coachability\|5.?layer\|development.*velocity` | cv_identity |
| 13 | `export.*(?:cv\|profile)\|recruit.*visib` | cv_identity |
| 14 | `scout.*(?:report\|profile)\|career.*(?:history\|entry)` | cv_identity |
| 15 | `periodization\|training.*block\|block.*phase` | training_program |
| 16 | `create.*block\|sessions?\s*per\s*week` | training_program |
| 17 | `phv.*(?:safe\|appropriate)\|load.*override` | training_program |
| 18 | `generat.*session\|build.*session` | timeline |
| 19 | `add.*session\|create.*session\|schedule.*session` | timeline |
| 20 | `plan.*(?:my\s+)?day\|plan.*today` | timeline |
| 21 | `readiness\|energy\|sleep.*score\|vitals` | output |
| 22 | `load\|overload\|acwr` | output |
| 23 | `drill\|exercise\|workout` | output |
| 24 | `achievement\|milestone\|pr\b\|streak` | mastery |
| 25 | `schedule.*conflict\|clash` | timeline |
| 26 | `plan.*training\|training.*plan` | planning |
| 27 | `change.*mode\|switch.*mode` | planning |

### Tab Affinity Fallback

When no tiebreaker matches, the active UI tab determines the default agent:

| Active Tab | Default Agent |
|-----------|--------------|
| Timeline | timeline |
| Output | output |
| Mastery | mastery |
| OwnIt | output |
| Chat | output |

### Agent Lock (Conversation Continuity)

**Topic shift breaks lock** (re-route):
- `^(actually\|instead\|wait\|never mind\|forget that)`
- `^(let's talk about\|switch to\|go to)`
- `\bprogram\b` (program queries always re-route)

**Follow-up keeps lock** (stay with current agent):
- `^(yes\|no\|ok\|sure\|thanks\|got it\|do it\|confirm)`
- `^(what\|when\|where\|how\|why)\b`
- `^(tell me more\|explain\|go on\|continue)`

---

## 7. Complete Intent Registry

**File**: `ai-service/app/agents/intent_registry.py`

90+ IntentDefinition entries. Each maps: `intent_id` → `agent_type` + `capsule_type` + `description`.

### Core Intents (by Agent)

#### Output Agent (22 intents)

| Intent ID | Capsule Type | Description |
|-----------|-------------|-------------|
| `greeting` | None | Greeting — respond warmly |
| `check_in` | checkin_capsule | Daily wellness check-in |
| `navigate` | navigation_capsule | Navigate to app tab |
| `show_programs` | program_action_capsule | List all programs |
| `manage_programs` | program_interact_capsule | Interact with specific program |
| `qa_readiness` | quick_action | Check readiness score |
| `qa_load` | quick_action | Check training load |
| `phv_query` | None | Growth/maturity questions |
| `phv_calculate` | phv_calculator_capsule | Calculate PHV stage |
| `today_briefing` | None | Daily briefing overview |
| `load_reduce` | None | Reduce training load |
| `load_advice_request` | None | Load/overtraining advice |
| `journal_pre` | training_journal_pre_capsule | Pre-training journal |
| `journal_post` | training_journal_post_capsule | Post-training journal |
| `whoop_sync` | whoop_sync_capsule | Sync WHOOP data |
| `padel_shots` | padel_shot_capsule | Log padel shots |
| `blazepods` | blazepods_capsule | Log BlazePods data |
| `notification_settings` | notification_settings_capsule | Notification preferences |
| `recommendations` | None | View active recommendations |
| `drill_rating` | drill_rating_capsule | Rate a drill |

#### Timeline Agent (18 intents)

| Intent ID | Capsule Type | Description |
|-----------|-------------|-------------|
| `create_event` | event_edit_capsule | Create calendar event |
| `update_event` | event_edit_capsule | Update calendar event |
| `delete_event` | event_edit_capsule | Delete calendar event |
| `schedule_rules` | schedule_rules_capsule | Edit schedule rules |
| `plan_training` | training_schedule_capsule | Generate training plan (DEPRECATED) |
| `plan_study` | study_schedule_capsule | Study schedule |
| `plan_regular_study` | regular_study_capsule | Regular study blocks |
| `add_exam` | exam_capsule | Add exam to calendar |
| `exam_schedule` | event_edit_capsule | View exam schedule |
| `manage_subjects` | subject_capsule | Manage subjects |
| `training_categories` | training_category_capsule | Manage training categories |
| `check_conflicts` | conflict_resolution_capsule | Check schedule conflicts |
| `ghost_suggestions` | ghost_suggestion_capsule | AI schedule suggestions |
| `bulk_edit_events` | bulk_timeline_edit_capsule | Bulk event operations |
| `day_lock` | day_lock_capsule | Lock/unlock schedule day |
| `qa_today_schedule` | quick_action | Today's schedule |
| `qa_week_schedule` | quick_action | This week's schedule |
| `full_reset` | None | Reset schedule |

#### Testing & Benchmark Agent (8 intents)

| Intent ID | Description |
|-----------|-------------|
| `log_test` | Log test result |
| `qa_test_history` | View test history |
| `strengths_gaps` | Strengths/gaps analysis |
| `benchmark_comparison` | Age-group benchmark comparison |
| `combine_readiness` | Combine readiness composite score |
| `test_report` | Scout-ready test report |
| `test_trajectory` | Score trajectory over time |
| `schedule_test_session` | Schedule test battery |

#### Mastery Agent (4 intents)

| Intent ID | Description |
|-----------|-------------|
| `edit_cv` | Edit athletic CV |
| `edit_club` | Edit club info |
| `qa_streak` | Check streak |
| `leaderboard` | View leaderboard |

#### Settings Agent (20 intents)

| Intent ID | Description |
|-----------|-------------|
| `set_goal` | Set performance goal |
| `view_goals` | View goals |
| `update_goal` | Update goal |
| `injury_mode` | Activate injury mode |
| `log_injury` | Log injury |
| `injury_status` | Check injury status |
| `log_nutrition` | Log meal |
| `view_nutrition` | View nutrition log |
| `log_sleep` | Log sleep |
| `update_profile` | Update profile |
| `view_profile` | View profile |
| `app_settings` | App preferences |
| `notification_config` | Configure notifications |
| `view_notifications` | View notifications |
| `clear_notifications` | Clear notifications |
| `wearable_status` | Check wearable status |
| `connect_wearable` | Connect wearable |
| `view_sleep_data` | View wearable sleep |
| `browse_drills` | Browse drill library |
| `refresh_recommendations` | Refresh AI recs |

#### Recovery Agent (6 intents)

| Intent ID | Description |
|-----------|-------------|
| `recovery_status` | Check recovery status |
| `deload_recommendation` | Get deload recommendation |
| `trigger_deload` | Start deload week |
| `log_recovery` | Log recovery session |
| `tissue_loading` | View tissue loading history |
| `flag_injury` | Flag injury concern |

#### Dual-Load Agent (6 intents)

| Intent ID | Description |
|-----------|-------------|
| `dual_load_dashboard` | Athletic vs academic balance |
| `cognitive_windows` | Optimal study windows |
| `exam_collision` | Exam-training collision forecast |
| `academic_priority` | Activate exam priority mode |
| `integrated_plan` | Integrated weekly plan |
| `academic_stress` | Log academic stress level |

#### CV & Identity Agent (6 intents)

| Intent ID | Description |
|-----------|-------------|
| `five_layer_identity` | 5-layer performance identity |
| `coachability_index` | Coachability composite score |
| `development_velocity` | Improvement rate across metrics |
| `recruitment_visibility` | Toggle recruitment visibility |
| `cv_export` | Generate scout-ready CV |
| `verified_achievement` | Add verified achievement |

#### Training Program Agent (7 intents)

| Intent ID | Description |
|-----------|-------------|
| `phv_programs` | PHV-safe programs |
| `periodization` | Current periodization context |
| `position_programs` | Position-specific programs |
| `block_history` | Training block history |
| `create_block` | Create training block |
| `update_phase` | Transition block phase |
| `load_override` | Override session load |

#### Planning Agent (not yet fully wired)

| Intent ID | Description |
|-----------|-------------|
| `exam_setup` | Set up exam period |

---

## 8. 10-Agent System & 93 Tools

### Agent Summary

| Agent | Tools | Read | Write | Primary Domain |
|-------|-------|------|-------|---------------|
| **output** | 16 | 11 | 5 | Readiness, vitals, drills, programs, check-ins, journals |
| **timeline** | 7 | 5 | 2 | Calendar CRUD, schedule, conflict detection |
| **mastery** | 7 | 6 | 1 | Achievements, trajectory, CV, consistency, career history |
| **settings** | 25 | 10 | 15 | Goals, injury, nutrition, sleep, profile, notifications, wearables |
| **planning** | 5 | 5 | 0 | Planning context, modes, protocols, weekly plans |
| **testing_benchmark** | 8 | 6 | 2 | Test results, benchmarks, catalogs, combine readiness, reports |
| **recovery** | 6 | 3 | 3 | Recovery status, deload, tissue loading, injury flagging |
| **training_program** | 7 | 4 | 3 | Periodization, PHV-safe programs, blocks, load overrides |
| **dual_load** | 6 | 3 | 3 | Athletic/academic balance, cognitive windows, exam collisions |
| **cv_identity** | 6 | 4 | 2 | 5-layer identity, coachability, development velocity, CV export |
| **TOTAL** | **93** | **57** | **36** | |

### Complete Tool Reference

#### output_tools.py (16 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_readiness_detail` | Read | Readiness breakdown: energy, soreness, sleep, mood, pain, wellness |
| `get_vitals_trend` | Read | Vitals trend (HRV, RHR, sleep, SpO2) over N days |
| `get_checkin_history` | Read | Check-in history over N days |
| `get_dual_load_score` | Read | Dual load index, ACWR, ATL, CTL, injury risk |
| `log_check_in` | Write | Log wellness check-in |
| `get_training_session` | Read | Generate training session with drills matching sport/position/readiness |
| `get_drill_detail` | Read | Full drill details: description, equipment, progressions |
| `get_training_program_recommendations` | Read | Personalized program recommendations |
| `calculate_phv_stage` | Read | PHV maturity stage, loading multiplier, contraindications |
| `get_my_programs` | Read | Active/enrolled programs |
| `get_program_by_id` | Read | Full program details with prescriptions |
| `rate_drill` | Write | Rate a drill: rating, difficulty, effort, completion |
| `get_today_training_for_journal` | Read | Today's completed sessions for journaling |
| `get_pending_post_journal` | Read | Sessions pending post-training journal |
| `save_journal_pre` | Write | Pre-training journal: target focus, mental cue |
| `save_journal_post` | Write | Post-training journal: outcome, body feel |

#### timeline_tools.py (7 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_today_events` | Read | Events for a specific date (default today) |
| `get_week_schedule` | Read | Full 7-day schedule with events and rest days |
| `create_event` | Write | Create calendar event: type, date, time, intensity, notes |
| `update_event` | Write | Update existing event fields |
| `delete_event` | Write | Delete event by ID |
| `detect_load_collision` | Read | Detect scheduling conflicts and rule violations |
| `suggest_time_slots` | Read | Suggest 2-3 best time slots with scoring |

#### mastery_tools.py (7 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_achievement_history` | Read | Milestones, PRs, streaks, badges |
| `get_test_trajectory` | Read | Score trajectory with improvement trend |
| `get_cv_summary` | Read | Complete CV: profile, highlights, mastery scores, gaps |
| `get_consistency_score` | Read | Streak, compliance, journal completion |
| `list_career_history` | Read | Teams, clubs, competitions, awards |
| `add_career_entry` | Write | Add career history entry |
| `update_career_entry` | Write | Update career history entry |

#### settings_tools.py (25 tools)

**Read (10)**: `get_goals`, `get_injury_status`, `get_nutrition_log`, `get_sleep_log`, `get_profile`, `get_notification_preferences`, `get_schedule_rules`, `get_wearable_status`, `get_drill_library`, `navigate_to`

**Write (15)**: `set_goal`, `complete_goal`, `delete_goal`, `log_injury`, `clear_injury`, `log_nutrition`, `log_sleep`, `update_profile`, `update_notification_preferences`, `update_schedule_rules`, `toggle_league_mode`, `toggle_exam_period`, `sync_wearable`

#### testing_benchmark_tools.py (8 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_test_results` | Read | Test results history, optionally filtered by type |
| `get_test_catalog` | Read | All available test types |
| `get_benchmark_comparison` | Read | Percentile comparison vs normative data |
| `log_test_result` | Write | Log test via phone test pipeline |
| `get_test_trajectory` | Read | Score trajectory, best/worst, average |
| `create_test_session` | Write | Schedule test battery on calendar |
| `get_combine_readiness_score` | Read | Composite readiness across all tested metrics |
| `generate_test_report` | Read | Scout-ready report with percentiles and trajectory |

#### recovery_tools.py (6 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_recovery_status` | Read | Recovery status: readiness, ACWR, injury risk, sleep |
| `get_deload_recommendation` | Read | Deload analysis: ACWR, monotony, strain, injury risk |
| `trigger_deload_week` | Write | Start deload week with intensity caps |
| `log_recovery_session` | Write | Log recovery: foam roll, stretch, ice bath, etc. |
| `get_tissue_loading_history` | Read | Daily volume, intensity, body areas stressed |
| `flag_injury_concern` | Write | Flag injury, notify coach via Triangle |

#### training_program_tools.py (7 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_phv_appropriate_programs` | Read | PHV-safe programs, contraindicated exercises excluded |
| `get_periodization_context` | Read | Active block, phase, week, load progression |
| `get_position_program_recommendations` | Read | Position-specific programs matched to gaps and load |
| `get_training_block_history` | Read | Past and current blocks with phase progression |
| `create_training_block` | Write | Create periodized block: phase, duration, goals |
| `update_block_phase` | Write | Transition block phase |
| `override_session_load` | Write | Override load/intensity with reason tracking |

#### dual_load_tools.py (6 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_dual_load_dashboard` | Read | Athletic/academic balance, combined index, exam proximity |
| `get_cognitive_readiness_windows` | Read | Optimal study times based on training |
| `get_exam_collision_forecast` | Read | Exam-training collision forecast with recommendations |
| `set_academic_priority_period` | Write | Activate exam priority mode, cap intensity |
| `generate_integrated_weekly_plan` | Write | Integrated plan balancing training + academics |
| `set_academic_stress_level` | Write | Log academic stress (1-10), trigger dual-load adjustments |

#### cv_identity_tools.py (6 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_5_layer_identity` | Read | Physical, Technical, Tactical, Mental, Social scores |
| `get_coachability_index` | Read | Response rate, PB frequency, consistency, adherence |
| `get_development_velocity` | Read | Rate of improvement across tested metrics |
| `set_recruitment_visibility` | Write | Toggle talent database visibility |
| `generate_cv_export` | Read | Scout-ready CV export |
| `add_verified_achievement` | Write | Add achievement pending coach confirmation |

#### planning_tools.py (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `get_planning_context` | Read | Active mode, protocols, dual load zone, data confidence |
| `get_mode_options` | Read | Available modes: balanced, league_active, study, rest_recovery |
| `propose_mode_change` | Read | Propose mode change with effects and warnings |
| `get_current_plan` | Read | Weekly plan with load distribution and mode constraints |
| `get_protocol_details` | Read | Protocol details or list all applicable protocols |

---

## 9. System Prompt Architecture

**File**: `ai-service/app/agents/prompt_builder.py`

### 2-Block Caching Strategy

| Block | Content | Caching | Size |
|-------|---------|---------|------|
| **Static** | Coaching identity, response rules, output format, agent-specific prompt | Cached (ephemeral) — free on cache hit | ~2,500 tokens |
| **Dynamic** | Player context, sport, PHV, tone, snapshot, temporal, schedule rules, recs, RAG, memory | Per-request — full token cost | ~2,000-4,000 tokens |

### Static Block Components

1. **COACHING_IDENTITY** — Core personality ("You are Tomo, a personal AI coach for young athletes")
2. **GUARDRAIL_BLOCK** — Safety rules (PHV, crisis detection, PED detection, medical disclaimers)
3. **PULSE_RESPONSE_RULES** — 12 rules governing response structure (data cards, headlines, body length, chips)
4. **PULSE_OUTPUT_FORMAT** — JSON schema definition for `{headline, body, cards[], chips[]}`
5. **Agent-specific static** — 10 builders, one per agent type:
   - `build_output_static()` — readiness interpretation, drill recommendations
   - `build_timeline_static()` — calendar operations, event creation rules
   - `build_mastery_static()` — progress tracking, CV management
   - `build_settings_static()` — profile updates, preferences
   - `build_planning_static()` — mode management, protocols
   - `build_testing_benchmark_static()` — test logging, benchmark comparison
   - `build_recovery_static()` — deload protocols, recovery sessions
   - `build_dual_load_static()` — academic/athletic balance
   - `build_cv_identity_static()` — 5-layer identity, recruitment
   - `build_training_program_static()` — periodization, PHV safety

### Dynamic Block Components (15 sections, built per-request)

| # | Section | Source |
|---|---------|--------|
| 1 | CCRS readiness block | `snapshot_enrichment.ccrs`, `ccrs_recommendation`, `ccrs_confidence` |
| 2 | Sport context | `player_context.sport` — sport-specific coaching rules |
| 3 | Position context | `player_context.position` — position-specific guidance |
| 4 | PHV safety block | `snapshot_enrichment.phv_stage`, `phv_offset_years` |
| 5 | Age-band tone profile | `player_context.age_band` — communication style |
| 6 | Snapshot data | Readiness, injury risk, ACWR, data confidence, etc. |
| 7 | Temporal context | Time of day, day of week, match day, exam proximity |
| 8 | Schedule rules | From `player_schedule_preferences` |
| 9 | Active recommendations | Top 5 from `athlete_recommendations` |
| 10 | Conversation state | Prior turns, current topic |
| 11 | RAG context | Knowledge chunks from retrieval |
| 12 | Memory context | Zep session/fact memory |
| 13 | AIB summary | Athlete Intelligence Brief |
| 14 | Wearable status | WHOOP connection + sync info |
| 15 | Intent guidance | Intent-specific coaching direction |

### Age-Band Tone Profiles (7 bands)

| Band | Voice |
|------|-------|
| U13 | Fun, encouraging coach. Use their name. Celebrate small wins. Game-like framing. |
| U15 | Big sibling energy. Be real — they spot fake positivity. Ask how they're feeling before data. |
| U17 | Trusted coach who respects them as serious athletes. Acknowledge effort and pressure. |
| U19 | Professional but human. Data packaged as coaching insight. Still ask how they're feeling. |
| U21 | Direct and professional, but still human. Acknowledge effort alongside data. |
| SEN | Direct and professional, but still human. |
| VET | Direct and professional, but still human. |

### Greeting Energy Tiers (7 tiers)

| Tier | Trigger | Response Style |
|------|---------|---------------|
| high_energy | Exclamation marks, "pumped", "fired up" | Match excitement, short + action-oriented |
| neutral | Standard greetings | Warm and easy |
| low_energy | "tired", "exhausted", "rough" | Mirror calm, gentle check-in |
| late_night | Hour check (10 PM - 5 AM) | Acknowledge hour, slightly concerned |
| early_morning | Hour check (5-7 AM) | Respect commitment |
| returning | Gap > 3 days | Welcome back, zero guilt |
| post_match | "match", "game" in recent events | Ask about match, genuine interest |

---

## 10. RAG Knowledge System

### Architecture

| Component | Technology | Role |
|-----------|-----------|------|
| Embeddings | Voyage AI (`voyage-3-lite`, 512-dim) | Query + chunk vectorization |
| Vector store | pgvector (Supabase) | Similarity search |
| Reranking | Cohere v3.5 | Reorder by relevance |
| Knowledge base | 24 sports science chunks + 8 position-specific chunks | Domain grounding |

### 5 Retrieval Signals

1. **Entity extraction** — Sport, position, age band, injury type from query
2. **Semantic similarity** — Voyage embedding cosine distance
3. **Keyword overlap** — BM25-style term matching
4. **Intent-aware expansion** — Domain terms appended based on classified intent
5. **Reranking** — Cohere reorders by query-chunk relevance

### Query Expansion Examples

| Intent | Expansion Terms |
|--------|----------------|
| `qa_readiness` | "athlete readiness training load management recovery protocol ACWR" |
| `injury_query` | "injury prevention youth athlete load management risk factors ACL growth plate" |
| `recovery_guidance` | "recovery protocols load reduction active recovery youth athlete" |
| `training_planning` | "training periodization youth athlete season planning" |

### Synonym Expansion

| Casual Language | Formal Terms Added |
|----------------|-------------------|
| "tired", "exhausted", "drained" | "recovery fatigue readiness REST overtraining" |
| "rest", "chill", "day off" | "recovery deload active recovery rest day" |
| "growing", "growth spurt" | "PHV Peak Height Velocity growth plate maturation" |
| "fast", "slow", "quick" | "sprint speed acceleration agility" |

---

## 11. Conversation History & Memory

### Conversation History

**File**: `ai-service/app/graph/conversation_history.py`

**Token budget**: 5,000 tokens (~20,000 chars). Intentionally tight — total context includes system prompt (~2K), player context (~1.5K), RAG (~1K), tool results (~3K per tool).

**Loading**: Last 30 rows from `chat_messages` table, ordered by `created_at ASC`.

**Deduplication**: TypeScript gateway + Python persist both save user messages. Consecutive same-role messages with identical content hash are deduplicated.

**Token budgeting strategy**:
- Fits within budget → return all
- Over budget → keep last 4 messages verbatim, compress older into deterministic summary (no LLM cost)

**Structured response extraction** (`_extract_readable_content`):

When loading history, stored JSON responses are converted to readable text. Supports 13 card types:

| Card Type | Extraction |
|-----------|-----------|
| `week_plan` | `[Showed week plan: MON: tags at time; ...]` |
| `confirm_card` | `[Proposed to add: title on date at time]` |
| `stat_grid` | `[Stats shown: label: value, ...]` |
| `text_card` / `coach_note` | Body text directly |
| `schedule_list` | `[Schedule shown: time title, ...]` |
| `session_plan` | `[Session plan: drill names]` |
| `program_recommendation` | `[Programs suggested: names]` |
| `benchmark_bar` | `[Benchmark: metric at Nth percentile]` |
| `choice_card` | `[Choices offered: labels]` |
| `drill_card` | `[Drill shown: name]` |
| `zone_stack` | `[Zones: labels]` |
| `stat_row` | `[label: value]` |

**Critical fallback**: If no readable content extracted, returns `"[Showed X cards]"` instead of raw JSON. Never returns JSON blobs to the LLM.

### Zep Memory (Multi-Tier)

**Tiers**:
1. **Session memory** — Short-term, current conversation
2. **Fact memory** — Extracted facts about athlete (Haiku-powered)
3. **Longitudinal memory** — `athlete_longitudinal_memory` table (cross-session)

Memory is injected into the dynamic system prompt block. Fire-and-forget saves — failures never block chat.

---

## 12. Write Action Confirmation Flow

**File**: `ai-service/app/agents/tools/bridge.py`

### Write Action Detection

36 tool names classified as write actions:

```
Timeline: create_event, update_event, delete_event
Output: log_check_in, log_test_result, rate_drill, save_journal_pre, save_journal_post, create_test_session
Settings: set_goal, complete_goal, delete_goal, log_injury, clear_injury, flag_injury_concern,
          log_nutrition, log_sleep, update_profile, update_notification_preferences,
          update_schedule_rules, toggle_league_mode, toggle_exam_period
Mastery: add_career_entry, update_career_entry, add_verified_achievement, set_recruitment_visibility
Planning: propose_mode_change, create_training_block, update_block_phase, override_session_load,
          generate_integrated_weekly_plan
Recovery: trigger_deload_week, log_recovery_session
Integration: sync_wearable
Dual-Load: set_academic_priority_period, set_academic_stress_level
```

### Capsule Direct Actions (no confirmation needed)

```
log_check_in, log_test_result, rate_drill, save_journal_pre, save_journal_post,
update_profile, complete_goal, log_nutrition, log_sleep, sync_wearable
```

### Flow

```
User: "Add a speed session tomorrow at 5pm"
  ↓
agent_dispatch: LLM calls create_event(title, date, time, type)
  ↓
Write action detected → INTERRUPT (do not execute)
  ↓
Return pending_write_action: {
  actions: [{toolName: "create_event", toolInput: {...}, agentType: "timeline"}],
  preview: "Speed Session on Tue Apr 15 at 5:00 PM"
}
  ↓
format_response: Render confirm_card with items, confirm/cancel buttons
  ↓
Mobile: Show confirmation UI
  ↓
User taps CONFIRM
  ↓
New request: { message: "confirm", confirmedAction: {actions: [...]} }
  ↓
pre_router: Detects write_confirmed → route to execute_confirmed
  ↓
execute_confirmed: Execute tools, collect results, compute refresh targets
  ↓
validate → format_response → persist → done
```

---

## 13. TypeScript Backend Bridge

**File**: `ai-service/app/agents/tools/bridge.py`

### Architecture

Read tools query Supabase directly via psycopg3 (async connection pool).
Write tools proxy to TypeScript API endpoints so the event pipeline fires correctly:

```
Python write tool → bridge_post() → TS Backend API
                                        ↓
                                   emitEventSafe()
                                        ↓
                                   processEvent()
                                        ↓
                                   writeSnapshot()
                                        ↓
                              triggerRecommendationComputation()
```

### HTTP Client

```python
httpx.AsyncClient(
    base_url="http://tomo-app.railway.internal:8080",  # Railway private network
    headers={
        "Authorization": f"Bearer {supabase_service_role_key}",
        "X-Tomo-Internal": "ai-service",
        "x-tomo-user-id": user_id,
    },
    timeout=Timeout(30s connect=5s),
)
```

### Methods

| Method | Function | Usage |
|--------|----------|-------|
| POST | `bridge_post(path, body, user_id)` | Create operations |
| PUT | `bridge_put(path, body, user_id)` | Full updates |
| PATCH | `bridge_patch(path, body, user_id)` | Partial updates |
| DELETE | `bridge_delete(path, body, user_id)` | Delete operations |
| GET | `bridge_get(path, params, user_id)` | Read fallback |

All methods return `{"error": "..."}` on failure (never throw).

---

## 14. Validation & Safety Layers

### PHV Safety (Layer 1 — Advisory)

11 contraindicated movement patterns for mid-PHV athletes:

```
barbell (back) squat, depth jump, drop jump, olympic lift, clean and jerk,
snatch, maximal sprint, heavy deadlift, max squat/deadlift/bench, 1RM, plyometric max
```

Response: Appends advisory warning with safer alternatives. Never blocks.

### Tone Validation (Layer 2 — Log Only)

Banned phrase patterns:
```
"today's session (will|focuses|is designed)"
"the programme (requires|states|indicates)"
"research shows that"
"it is important to (note|understand|remember)"
"according to (your|the) data"
"your (ACWR|HRV|readiness score) (is|indicates|shows)"
"based on (your|the) (data|metrics|performance)"
"I recommend that you"
"studies (show|suggest|indicate)"
```

### Content Safety (Crisis Detection)

Keywords trigger crisis response:
```
suicide, self-harm, kill myself, end my life, don't want to live, eating disorder, purging, anorexia
```

Response: Immediate empathetic response + helpline numbers. Overrides all other output.

### PED Detection

Keywords: `steroids, HGH, EPO, testosterone, anabolic, doping, performance enhancing drugs`

Response: Educational response about health risks + clean sport principles.

### Medical Disclaimer

Triggered when response discusses injury treatment. Appended coaching-voice disclaimer.

---

## 15. Response Formatting

**File**: `ai-service/app/graph/nodes/format_response.py`

### Card Types (13 data cards + 4 content cards)

**Data cards** (rendered first):
```
stat_grid, stat_row, schedule_list, zone_stack, benchmark_bar,
session_plan, program_recommendation, clash_list, phv_assessment,
drill_card, week_schedule, week_plan, choice_card
```

**Content cards**:
```
text_card, coach_note, confirm_card, self_contained cards
```

### Response Structure

```json
{
  "headline": "Recovery looks solid today",
  "body": "Your readiness is back in the green after yesterday's rest...",
  "cards": [
    {"type": "stat_grid", "items": [{"label": "Readiness", "value": "82/100", "highlight": "green"}]},
    {"type": "text_card", "body": "Light session today would be ideal..."}
  ],
  "chips": [
    {"label": "Plan a light session", "message": "Build me a light training session for today"},
    {"label": "Check my schedule", "message": "What's on my schedule today?"}
  ]
}
```

### Stat Grid Value Sanitization

| Raw Value | Display |
|-----------|---------|
| HRV 70ms+ | "Strong" |
| HRV 50-70ms | "Okay" |
| HRV <50ms | "Low" |
| Energy 4-5/5 | "High" |
| Energy 3/5 | "Good" |
| Energy 1-2/5 | "Low" |
| ACWR >1.5 | "Spiked" |
| ACWR 1.3-1.5 | "Elevated" |
| ACWR 1.0-1.3 | "Building" |
| ACWR <1.0 | "Good" |

---

## 16. Persistence & Observability

### ai_trace_log (51 Columns)

**Core routing**: request_id, user_id, session_id, message, path_type, agent_type, classification_layer, intent_id, routing_confidence, tool_count, tool_names

**Performance**: total_cost_usd, total_tokens, latency_ms, cost_bucket, latency_bucket, confidence_bucket, tool_bucket

**Validation**: validation_passed, validation_flags, validation_flag_count, phv_gate_fired, crisis_detected, ped_detected, medical_warning

**RAG**: rag_used, rag_entity_count, rag_chunk_count, rag_cost_usd, rag_latency_ms, rag_graph_hops, rag_sub_questions

**Context snapshots**: sport, age_band, phv_stage, readiness_score, readiness_rag, injury_risk, acwr, acwr_bucket, data_confidence_score, checkin_staleness_days, dual_load_zone

**Engagement**: plan_compliance_7d, checkin_consistency_7d, rec_action_rate_30d, position, readiness_bucket, target_achievement_rate_30d

**Write actions**: has_pending_write, write_confirmed

**Response**: assistant_response (first 5000 chars), turn_number, response_length_chars, capsule_type

### LangSmith Integration

All graph execution auto-traced via LangGraph. Metadata + tags computed in persist node via `build_post_execution_metadata(state)`.

### Logging Hierarchy

```
tomo-ai.supervisor     — Graph execution lifecycle
tomo-ai.context        — Context assembly queries
tomo-ai.pre_router     — Classification + routing decisions
tomo-ai.rag_retrieval  — Knowledge retrieval
tomo-ai.agent_dispatch — LLM iterations + tool calls
tomo-ai.validate       — Validation flags
tomo-ai.format         — JSON parsing + formatting
tomo-ai.persist        — Database saves
tomo-ai.bridge         — TS backend HTTP calls
tomo-ai.conversation_history — History loading + dedup
```

---

## 17. State Model

**File**: `ai-service/app/models/state.py`

TomoChatState is a TypedDict (LangGraph-compatible) with ~30 fields that evolve through the pipeline:

### Input Fields (set at invocation)

```python
user_id: str
session_id: str
message: str
active_tab: str          # "Chat", "Timeline", "Output", "Mastery", "OwnIt"
timezone: str            # "US/Eastern", "Europe/London", etc.
request_id: str          # UUID for tracing
messages: list           # LangChain BaseMessage objects
write_confirmed: bool
pending_write_action: dict | None
selected_agent: str | None  # From prior session (agent lock)
```

### Assembled Fields (context_assembly)

```python
player_context: PlayerContext    # 120+ fields
aib_summary: str                # Athlete Intelligence Brief
```

### Routing Fields (pre_router)

```python
route_decision: "capsule" | "ai"
capsule_type: str | None
selected_agent: str              # Updated
routing_confidence: float        # 0.0-1.0
classification_layer: str        # "exact_match" | "llm_classification" | "fallthrough" | "agent_lock"
intent_id: str                   # Classified intent
_secondary_agents: list[str] | None
_safety_override: dict | None    # {reason, forced_mode, ...}
```

### RAG Fields (rag_retrieval)

```python
rag_context: str           # Formatted knowledge text for prompt injection
rag_metadata: dict         # entity_count, chunk_count, hops, cost, latency
```

### Agent Fields (agent_dispatch)

```python
agent_response: str        # LLM text output (before validation)
tool_calls: list[dict]     # [{name, input, result_preview, iteration}, ...]
total_cost_usd: float      # Accumulated across all LLM calls + RAG
total_tokens: int           # Accumulated input + output
latency_ms: float
pending_write_action: dict | None  # Updated on write detection
```

### Validation Fields (validate)

```python
validation_passed: bool    # Always True (advisory only)
validation_flags: list[str]  # ["phv_safety_advisory", "tone_violation", ...]
```

### Final Fields (format_response)

```python
final_response: str       # JSON serialized {headline, body, cards, chips}
final_cards: list[dict]   # Extracted cards for telemetry
```

### PlayerContext Highlights (120+ fields)

**Identity**: name, sport, position, age, age_band, gender, role

**Readiness**: snapshot_enrichment (90+ sub-fields including CCRS, ACWR, injury_risk_flag, readiness_rag, readiness_score, data_confidence_score, phv_stage, phv_offset_years, dual_load_zone, hrv_baseline_ms, sleep_quality, recovery_score, wellness_7day_avg)

**Temporal**: today_date, time_of_day, day_of_week, checkin_date, checkin_staleness

**Schedule**: today_events, upcoming_events, upcoming_exams, projected_load_7day

**Tests**: phone_tests, football_tests

**Planning**: schedule_preferences (23 fields), recommendations, pd_protocols

**Wearables**: wearable_status (WHOOP connection + sync)

---

## 18. Configuration & Environment

**File**: `ai-service/app/config.py`

```python
class Settings(BaseSettings):
    # AI
    anthropic_api_key: str
    voyage_api_key: str
    cohere_api_key: str
    langsmith_api_key: str

    # LangSmith
    langchain_tracing_v2: bool = True
    langchain_project: str = "tomo-ai-staging"

    # Database
    supabase_url: str
    supabase_service_role_key: str
    supabase_db_url: str  # PostgreSQL (pooler 6543 or direct 5432)

    # Bridge
    ts_backend_url: str = "http://tomo-app.railway.internal:8080"
    ts_backend_service_key: str

    # Memory
    zep_api_key: str
    zep_base_url: str = "http://tomo-zep.railway.internal:8000"

    # Service
    port: int = 8000
    environment: str = "development"
    log_level: str = "info"
```

---

## 19. TypeScript Gateway (agent-stream)

**File**: `backend/app/api/v1/chat/agent-stream/route.ts`

### Request Flow

1. **Auth**: `requireAuth(req)` — Bearer token check
2. **Rate limit**: `checkRateLimit(userId, 20, 60000)` — 20 req/min
3. **Body parse**: Extract message (max 2000 chars)
4. **Session**: `getOrCreateSession()`, `saveMessage()` — Supabase chat_sessions + chat_messages
5. **Capsule check**: If `body.capsuleAction` → execute locally via TS tool executors ($0)
6. **Safety gate**: `checkRedRiskForTool()` on capsule write actions — modify tool input if RED risk
7. **Proxy**: If not capsule → `proxyToAIServiceStream(aiRequest)` → Python AI service

### Capsule Executors (TS-side)

| Agent | Executor | Purpose |
|-------|----------|---------|
| output | `executeOutputTool` | Direct button-press actions (check-in, navigation) |
| timeline | `executeTimelineTool` | Calendar quick actions |
| mastery | `executeMasteryTool` | CV/progress quick actions |
| settings | `executeSettingsTool` | Profile/preference quick actions |

### AI Service Proxy

```typescript
const aiRequest: AIServiceRequest = {
  message,
  session_id: sessionId,
  player_id: auth.user.id,
  active_tab: body.activeTab ?? "Chat",
  timezone: body.timezone ?? "UTC",
  confirmed_action: body.confirmedAction ?? null,
};

for await (const sse of proxyToAIServiceStream(aiRequest, statusCallback)) {
  send(sse.event, sse.data);
}
```

### Sync Endpoint

`POST /api/v1/chat/agent` — Same flow without SSE streaming (testing only).

---

## 20. Mobile Chat Integration

### Key Files

| File | Purpose |
|------|---------|
| `mobile/src/components/chat/ChatScreen.tsx` | Main chat UI |
| `mobile/src/components/chat/ResponseRenderer.tsx` | Card type rendering (stat_grid, confirm_card, etc.) |
| `mobile/src/components/chat/ChatInput.tsx` | Message input + chip actions |
| `mobile/src/services/chatService.ts` | SSE client, message persistence |
| `mobile/src/services/apiConfig.ts` | API URL routing (localhost vs production) |

### SSE Client

Mobile connects to `/api/v1/chat/agent-stream` via SSE. Handles three event types:
- `status` → Show thinking indicator
- `done` → Parse structured response, render cards
- `error` → Show error message

### Card Rendering

`ResponseRenderer.tsx` maps card types to React Native components. All `.map()` calls guarded with `Array.isArray()` (baseline protection).

### Refresh Bus

When `refreshTargets` returned in response, mobile triggers targeted data refreshes:
```
"calendar" → refetch calendar events
"readiness" → refetch snapshot + readiness
"recommendations" → refetch rec feed
"programs" → refetch program list
"metrics" → refetch test results
"notifications" → refetch notification count
```

---

## 21. Cost Architecture

### Per-Request Cost Breakdown

| Component | Cost | When |
|-----------|------|------|
| Context assembly | $0 | Always (direct DB queries) |
| Intent classification (exact match) | $0 | ~60% of requests |
| Intent classification (Haiku) | ~$0.0001 | ~30% of requests |
| RAG retrieval | ~$0.003 | ~70% of requests (skipped for nav/greeting/logging) |
| Agent dispatch (Haiku) | ~$0.001-0.005 | Always for full AI path |
| Prompt caching | -50% on static block | Always (cache hits) |
| Total per turn | ~$0.003 avg | |

### Cost Optimization Strategies

1. **2-block prompt caching** — Static block cached, only dynamic block costs tokens
2. **RAG skip** — 20+ intent types bypass retrieval entirely
3. **Capsule fast-path** — TS-side tool execution for button presses ($0)
4. **Haiku model** — $0.80/$4.00 per MTok (vs Sonnet at $3/$15)
5. **Tool result truncation** — 3,000 char cap prevents context bloat
6. **Token budgeted history** — 5K token cap with deterministic compression

---

## 22. Critical Thresholds & Constants

| Constant | Value | File |
|----------|-------|------|
| MAX_ITERATIONS (agent loop) | 5 | agent_dispatch.py |
| MAX_TOOL_RESULT_CHARS | 3,000 | agent_dispatch.py |
| LLM temperature | 0.3 | agent_dispatch.py |
| LLM max_tokens | 4,096 | agent_dispatch.py |
| TOKEN_BUDGET (history) | 5,000 | conversation_history.py |
| KEEP_RECENT (history) | 4 messages | conversation_history.py |
| MAX_HISTORY_ROWS | 30 | conversation_history.py |
| MAX_BODY_SENTENCES | 3 | format_response.py |
| RAG top_k | 6 | rag_retrieval.py |
| MIN_MESSAGE_LENGTH (RAG) | 8 chars | rag_retrieval.py |
| Classifier confidence threshold | 0.65 (Haiku) | intent_classifier.py |
| Pre-router confidence override | 0.8 | pre_router.py |
| Agent lock confidence | 0.85 | pre_router.py |
| Rate limit | 20 req/min | agent-stream/route.ts |
| Message max length | 2,000 chars | agent-stream/route.ts |
| Bridge timeout | 30s (5s connect) | bridge.py |
| Context assembly target | <800ms | context_assembly.py |

---

## 23. Complete File Reference

### Python AI Service (`ai-service/`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, CORS, lifespan, routes |
| `app/config.py` | Environment variables via Pydantic Settings |
| `app/routes/chat.py` | `/chat` (SSE) + `/chat/sync` endpoints |
| `app/routes/health.py` | `/health` endpoint |
| **Graph** | |
| `app/graph/supervisor.py` | LangGraph StateGraph definition + `run_supervisor()` |
| `app/graph/conversation_history.py` | History loading, dedup, token budgeting, structured extraction |
| `app/graph/nodes/context_assembly.py` | 15 parallel DB queries → PlayerContext |
| `app/graph/nodes/pre_router.py` | Intent classify + agent route + safety override |
| `app/graph/nodes/rag_retrieval.py` | RAG retrieval with skip logic + query expansion |
| `app/graph/nodes/agent_dispatch.py` | Agentic loop + write detection + confirmed execution |
| `app/graph/nodes/validate.py` | PHV safety + tone + format validation (advisory) |
| `app/graph/nodes/format_response.py` | JSON parsing + Pulse post-processing |
| `app/graph/nodes/persist.py` | chat_messages + Zep + ai_trace_log |
| **Intent System** | |
| `app/agents/intent_classifier.py` | 3-layer: exact match → Haiku → fallthrough |
| `app/agents/intent_registry.py` | 90+ IntentDefinition entries |
| `app/agents/router.py` | Agent routing + 27 tiebreaker rules |
| **Prompt** | |
| `app/agents/prompt_builder.py` | 2-block static/dynamic prompt assembly |
| `app/agents/greeting_handler.py` | 7-tier energy detection for greetings |
| **Tools** | |
| `app/agents/tools/__init__.py` | Tool factory: agent_type → tool list |
| `app/agents/tools/output_tools.py` | 16 output agent tools |
| `app/agents/tools/timeline_tools.py` | 7 timeline agent tools |
| `app/agents/tools/mastery_tools.py` | 7 mastery agent tools |
| `app/agents/tools/settings_tools.py` | 25 settings agent tools |
| `app/agents/tools/planning_tools.py` | 5 planning agent tools |
| `app/agents/tools/testing_benchmark_tools.py` | 8 testing/benchmark tools |
| `app/agents/tools/recovery_tools.py` | 6 recovery agent tools |
| `app/agents/tools/training_program_tools.py` | 7 training program tools |
| `app/agents/tools/dual_load_tools.py` | 6 dual-load agent tools |
| `app/agents/tools/cv_identity_tools.py` | 6 CV/identity agent tools |
| `app/agents/tools/bridge.py` | TS backend HTTP bridge + write action registry |
| **Models** | |
| `app/models/state.py` | TomoChatState TypedDict (~30 fields) |
| `app/models/context.py` | PlayerContext, SnapshotEnrichment (90+ fields), TemporalContext |
| **Infrastructure** | |
| `app/db/supabase.py` | psycopg3 async connection pool |
| `app/services/rag/` | RAG pipeline: retriever, embedder, reranker |
| `app/services/memory/` | Zep memory client |
| `app/utils/message_helpers.py` | LangChain message utilities |

### TypeScript Backend (`backend/`)

| File | Purpose |
|------|---------|
| `app/api/v1/chat/agent-stream/route.ts` | SSE streaming gateway (auth, session, capsule, proxy) |
| `app/api/v1/chat/agent/route.ts` | Sync chat endpoint (testing) |
| `services/agents/aiServiceProxy.ts` | HTTP proxy to Python AI service |
| `services/agents/contextBuilder.ts` | PlayerContext assembly (TS-side, for capsules) |
| `services/agents/chatGuardrails.ts` | preFlightCheck, checkRedRiskForTool |
| `services/agents/sessionService.ts` | Session CRUD + message persistence |
| `services/agents/outputAgent.ts` | Output capsule tool executor |
| `services/agents/timelineAgent.ts` | Timeline capsule tool executor |
| `services/agents/masteryAgent.ts` | Mastery capsule tool executor |
| `services/agents/settingsAgent.ts` | Settings capsule tool executor |
| `proxy.ts` | Auth proxy (Bearer + cookie), CORS |

### Mobile (`mobile/src/`)

| File | Purpose |
|------|---------|
| `components/chat/ChatScreen.tsx` | Main chat UI |
| `components/chat/ResponseRenderer.tsx` | Card type rendering |
| `components/chat/ChatInput.tsx` | Input + chip actions |
| `services/chatService.ts` | SSE client |
| `services/apiConfig.ts` | API URL routing |

---

> Generated April 13, 2026 from live codebase analysis. 93 tools, 10 agents, 90+ intents, 8 graph nodes.
