# Tomo AI Guardrails & Configuration Reference

> Single source of truth for all AI, safety, and performance thresholds.
> Last updated: March 19, 2026

---

## Claude Model & Token Limits

| Endpoint | File | max_tokens | Temperature | Model | Env Override |
|----------|------|-----------|-------------|-------|-------------|
| **Chat Orchestrator** | `services/agents/orchestrator.ts:272` | 4096 | default | claude-sonnet-4-20250514 | `ANTHROPIC_MODEL` |
| **Deep Program Refresh** | `services/programs/deepProgramRefresh.ts:210` | 4000 | 0.3 | claude-haiku-4-5-20251001 | `ANTHROPIC_PROGRAM_MODEL` |
| **Deep Rec Refresh** | `services/recommendations/deepRecRefresh.ts:203` | 3000 | 0.5 | claude-haiku-4-5-20251001 | `ANTHROPIC_REC_MODEL` |
| **Chat Service (legacy)** | `services/chat/claudeService.ts:74` | 2048 | default | claude-sonnet-4-20250514 | `ANTHROPIC_MODEL` |
| **Own It / For You** | `services/forYouService.ts:344` | 1024 | default | claude-haiku-4-5-20251001 | `ANTHROPIC_FORYOU_MODEL` |
| **RAG Generator** | `services/recommendations/rag/ragGenerator.ts:140` | 600 | 0.7 | claude-haiku-4-5-20251001 | `ANTHROPIC_RAG_MODEL` |

**Model strategy**: Sonnet for interactive chat (quality-critical), Haiku for batch/background jobs (cost-optimized). Each endpoint has its own env var override.

---

## Tool Use Limits

| Setting | Value | File |
|---------|-------|------|
| MAX_TOOL_ITERATIONS | 5 | `orchestrator.ts:44` |
| MAX_TOOL_ITERATIONS (legacy) | 5 | `claudeService.ts:12` |

---

## Rate Limiting

| Endpoint | Limit | Window | File |
|----------|-------|--------|------|
| `/chat/agent` | 20 req/user | 60s | `app/api/v1/chat/agent/route.ts` |
| `/recommendations/refresh` | 5 req/user | 60s | `app/api/v1/recommendations/refresh/route.ts` |
| Default (all other) | 100 req/user | 60s | `lib/rateLimit.ts` |

---

## Vercel Function Timeouts

| Route Pattern | Max Duration | File |
|---------------|-------------|------|
| `chat/*` | 60s | `vercel.json` |
| `recommendations/refresh` | 60s | `vercel.json` |
| `for-you` | 60s | `vercel.json` |
| All others | 30s (default) | Vercel platform |

---

## Retry Configuration (`lib/aiRetry.ts`)

| Setting | Value |
|---------|-------|
| Max retries | 2 |
| Initial delay | 1000ms |
| Max delay | 5000ms |
| Backoff | Exponential (1s, 2s) |
| Retryable statuses | 429, 500, 502, 503, 529, ECONNRESET, ETIMEDOUT |

---

## Session & Conversation

| Setting | Value | File |
|---------|-------|------|
| Session timeout | 30 minutes | `services/chat/sessionManager.ts` |
| Conversation history | Trimmed to token budget | `sessionManager.ts` |

---

## AI Safety — 3-Layer Guardrail System

### Layer 1: Pre-Flight (before Claude call)
**File**: `services/agents/chatGuardrails.ts`
- Regex classification of blocked topics
- **Blocked**: self-harm, politics, adult, violence, drugs, hate, gambling, general AI tasks
- **Allowlist**: sports nutrition, recovery, training terminology
- **Self-harm**: Compassionate redirect with Crisis Text Line + 988

### Layer 2: System Prompt Injection
**File**: `services/agents/chatGuardrails.ts` (GUARDRAIL_SYSTEM_BLOCK)
- Injected into every agent's system prompt
- Enforces Tomo-only topics
- Identity enforcement: "You are Tomo, not ChatGPT/Claude"

### Layer 3: Post-Generation Validation
**File**: `services/agents/chatGuardrails.ts` (validateResponse)
- Catches identity leaks (Claude, Anthropic, OpenAI mentions)
- Falls back to safe message on detection

---

## Response Format Rules

### Gen Z Rules (`orchestrator.ts:47-70`)
- Bottom line first (8-word headline max)
- Max 2 sentences per explanation
- Emoji anchors for visual scanning
- Stat format over prose
- 1-2 action suggestion chips
- Forbidden filler phrases

### Structured Output (`responseFormatter.ts:498-573`)
- Must return JSON in ```json``` markers
- Card types: stat_grid, stat_row, schedule_list, zone_stack, clash_list, benchmark_bar, text_card, coach_note, confirm_card, session_plan, drill_card, program_recommendation, phv_assessment
- 1-3 follow-up chips per response

---

## Performance & Load Thresholds

### ACWR (Acute:Chronic Workload Ratio)
| Zone | Range | Action |
|------|-------|--------|
| Safe | 0.8 - 1.3 | Normal training |
| Amber | 1.3 - 1.5 | Caution, reduce intensity |
| Danger | > 1.5 | High injury risk, rest recommended |

### Readiness Calculator (`services/readinessCalculator.ts`)
| State | Triggers |
|-------|----------|
| RED | Energy ≤ 3, Soreness ≥ 8, Sleep < 6h, Academic stress ≥ 8 |
| YELLOW | Energy 4-5, Soreness 6-7, Sleep 6-7h, Academic stress 6-7 |
| GREEN | All others |

### Schedule Rules (`services/scheduling/scheduleRuleEngine.ts`)
| Setting | Normal | League | Exam | League+Exam |
|---------|--------|--------|------|-------------|
| Max hard/week | 3 | 2 | 2 | 1 |
| Max sessions/day | 2 | 2 | 2 | 2 |

### Buffer Rules
| Buffer | Duration |
|--------|----------|
| Post-match recovery | 60 min |
| Post-high-intensity | 45 min |
| Pre-match preparation | 120 min |

---

## Recommendation Expiry (TTL)

| Type | Expiry | Staleness |
|------|--------|-----------|
| READINESS | 24h | 24h |
| LOAD_WARNING | 48h | 48h |
| RECOVERY | 12h | 12h |
| DEVELOPMENT | 7 days | 7 days |
| ACADEMIC | 72h | 72h |
| CV_OPPORTUNITY | 14 days | 14 days |
| TRIANGLE_ALERT | 72h | 72h |
| MOTIVATION | 48h | 48h |

### Deep Refresh Staleness
| Refresh Type | Stale After |
|-------------|-------------|
| Own It (recommendations) | 12 hours |
| Programs | 24 hours |

### RAG Content Cache
| Setting | Value |
|---------|-------|
| RAG generator in-memory cache TTL | 1 hour |
| Cache key | `recType + title + chunk titles + snapshot hash` |
| Max entries before eviction sweep | 100 |

---

## File & Upload Limits

| Limit | Value | File |
|-------|-------|------|
| Audio file (voice) | 5 MB | `app/api/v1/chat/transcribe/route.ts` |
| Pagination default | 50 records | `lib/pagination.ts` |
| Pagination max | 100 records | `lib/pagination.ts` |

---

## Query Limits

| Query | Limit | File |
|-------|-------|------|
| ACWR window | 28 days | `events/computations/acwrComputation.ts` |
| Vital readings | 28 days | `events/handlers/vitalHandler.ts` |
| Wellness trend | 14 days | `events/computations/wellnessTrend.ts` |
| Notifications | 50 | `services/notificationService.ts` |
| Calendar events | 20 | `services/events/calendarBridge.ts` |
| Drill search results | 30 | `services/chat/toolExecutor.ts` |
| Drill detail list | 5 | `services/chat/toolExecutor.ts` |
| RAG top-k vectors | 3 | `services/recommendations/rag/ragRetriever.ts` |
| Own It feed | 8 recs | `services/forYouService.ts` |

---

## Dual Load Normalization

| Metric | Max AU | Max Points |
|--------|--------|-----------|
| Athletic load | 500 | 50 |
| Academic load | 300 | 50 |

---

## Cache-Control Headers

| Endpoint | max-age | File |
|----------|---------|------|
| `/today` | 30s | `app/api/v1/today/route.ts` |
| `/streak` | 60s | `app/api/v1/streak/route.ts` |
| `/points` | 60s | `app/api/v1/points/route.ts` |
| `/stats` | 60s | `app/api/v1/stats/route.ts` |
| `/archetypes` | 300s | `app/api/v1/archetypes/route.ts` |
| `/snapshot` | 30s | `app/api/v1/snapshot/route.ts` |
| `/mastery/snapshot` | 300s | `app/api/v1/mastery/snapshot/route.ts` |
| `/content/*` | 300s | Content routes |
