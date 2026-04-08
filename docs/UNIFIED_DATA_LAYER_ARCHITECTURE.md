# Tomo Unified Data Layer — Architecture Plan

> **Status**: Approved — April 8, 2026
> **Author**: Tareq El Kayyali + Claude
> **Scope**: Consolidate 7 fragmented data aggregation layers into a single unified athlete state

---

## Context

Three Tomo surfaces (My Vitals, Chat, Own It) gave contradicting advice to the same athlete because each builds its own data view independently. The root cause: **Layer 2 (athlete_snapshots) is incomplete**, forcing consumers to bypass it and re-derive state from raw tables using different logic. This plan consolidates all data aggregation into a single unified layer that every consumer reads from.

### The Problem Today

| Surface | What It Said | Data Source | HRV Value |
|---------|-------------|-------------|-----------|
| My Vitals | "High energy — ready for quality session" | `health_data` + `checkins.energy` | 63.2ms |
| Tomo Chat | "ACWR 2.12 — deload 3-5 days" | `athlete_snapshots` via contextBuilder | 122ms baseline, 86ms today |
| Own It | "Training Spike Detected — URGENT" | `athlete_snapshots` via RIE computers | N/A |

Same athlete, same moment, three different narratives. Chat and Own It agreed (both read snapshot). My Vitals contradicted both (read raw tables with different logic).

---

## Current State: 7 Fragmented Layers

### Layer 1: Raw Input Tables (Source of Truth)
| Table | What It Stores |
|-------|---------------|
| `checkins` | Daily wellness (energy, soreness, sleep, mood, pain) |
| `health_data` | Wearable metrics (HRV, resting HR, sleep, SpO2, etc.) |
| `calendar_events` | Training, matches, exams, study, recovery |
| `athlete_events` | Immutable event stream (28 event types) |
| `phone_test_sessions` | Phone-based assessments |
| `football_test_results` | Sport-specific test results |
| `sleep_logs` | Detailed sleep tracking |
| `training_journals` | Pre/post-session reflections |

### Layer 2: Athlete Snapshot (`athlete_snapshots`)
- Single pre-computed row per athlete, ~35 fields
- Updated after EVERY event via `snapshotWriter.ts` + 5 computation modules
- Contains readiness, load, HRV, wellness, CV, mastery, PHV, journal data
- **Problem**: Only captures point-in-time state. No windowed data (7-day vitals, trends).

### Layer 2.5: Daily Load Buckets (`athlete_daily_load`)
- One row per athlete per day (training_load_au, academic_load_au, session_count)
- Feeds ACWR computation (28-row scan)

### Layer 3: RIE — Recommendation Intelligence Engine
- 9 deterministic computers, event-triggered
- Write to `athlete_recommendations`
- Read from snapshot only (consistent)

### Layer 4: Claude-Powered Deep Refresh
- `deepRecRefresh.ts` — holistic recs via Claude (on-demand, >24h staleness)
- `deepProgramRefresh.ts` — program recs via Claude + guardrails (>12h staleness)
- Both build full PlayerContext (13 parallel queries = raw + snapshot + recs)

### Layer 5: On-Demand Aggregators (computed per request, never persisted)
| Aggregator | What It Computes |
|-----------|-----------------|
| `contextBuilder.ts` | PlayerContext (25+ fields from 13 parallel queries) |
| `weeklyVitalsAggregator.ts` | 7-day rolling vitals + trends + percentiles |
| `benchmarkService.ts` | Test percentiles vs age/position norms |
| `scheduleRuleEngine.ts` | Effective rules, scenario detection |
| `readinessCalculator.ts` | GREEN/YELLOW/RED + intensity recommendation |
| `buildRichContextInsight()` | Template-based vital insight text |

### Layer 6: Persistent AI Context
| Store | Purpose |
|-------|---------|
| `athlete_longitudinal_memory` | Cross-session goals, concerns, injury history |
| `rag_knowledge_chunks` | 24 sports science + 8 position-specific chunks |
| `chat_sessions.conversation_state` | Within-session context |

### Layer 7: Notification Engine
- Reads snapshot + event data independently
- Generates `athlete_notifications` (22 types, 7 categories)

### Known Duplication

| Data Point | Where It's Computed | Times Duplicated |
|-----------|-------------------|-----------------|
| HRV "today" | vitalHandler → snapshot, Whoop sync → health_data | 2 sources |
| Sleep | checkins, health_data (Whoop), sleep_logs | 3 sources |
| Readiness | readinessCalculator, outputAgent, wellnessHandler | 2-3 paths |
| Benchmark profile | benchmarkService called from boot, contextBuilder, forYouService | Recomputed 3x/session |
| Test results | phone_test_sessions + football_test_results | 2 tables, merge logic duplicated |

---

## Core Insight: Expand Layer 2, Don't Replace It

The event-sourced architecture (events -> handlers -> snapshot) is sound. The problem is the snapshot only captures **point-in-time** state. Consumers needing **windowed** data (7-day vitals, trends, benchmarks) must independently compute it — creating contradictions. The fix: **3 companion tables + 1 read function**.

---

## Target Architecture

```
[Raw Input — UNCHANGED]
  athlete_events, checkins, health_data, calendar_events, test results
       |
       v  (event processor — existing pipeline, enhanced)
+-----------------------------------------------------+
|  UNIFIED ATHLETE STATE (Layer 2 — expanded)          |
|                                                      |
|  athlete_snapshots        (existing, ~60 cols)       |
|  athlete_daily_load       (existing, per-day)        |
|  athlete_daily_vitals     (NEW — daily rollups)      |
|  athlete_benchmark_cache  (NEW — cached norms)       |
|  athlete_weekly_digest    (NEW — weekly aggs)        |
|                                                      |
|  performance_rules        (NEW — CMS-managed)        |
|  rule_audit_log           (NEW — execution trace)    |
+------------------------+----------------------------+
                         |
                         v
+-----------------------------------------------------+
|  getAthleteState(athleteId, role, options)            |
|                                                      |
|  Returns: AthleteState {                             |
|    snapshot,          // point-in-time state         |
|    dailyVitals[],     // N-day window                |
|    dailyLoad[],       // 28-day window               |
|    weeklyDigest,      // weekly aggregation          |
|    benchmarkProfile,  // cached percentiles          |
|    todayEvents[],     // calendar                    |
|    upcomingEvents[],  // forward-looking             |
|    activeRecs[],      // current recommendations     |
|    triggeredRules[],  // active guardrails           |
|    memory?,           // AI consumers only           |
|    ragChunks?,        // AI consumers only           |
|  }                                                   |
|                                                      |
|  ALL consumers call this. Nothing else.              |
+------------------------+----------------------------+
                         |
          +--------------+--------------+-----------+
          v              v              v           v
       Chat AI       My Vitals      Own It     Notifications
       Boot          Mastery        RIE        CMS Admin
       Deep Rec      Timeline       Programs   CV Builder
```

---

## New Tables

### 1. `athlete_daily_vitals` — Daily Vital Rollups

One row per athlete per day. Resolves the "sleep in 3 tables" and "HRV in 2 tables" problems forever. **Single place** where source priority lives: WEARABLE > SLEEP_LOG > CHECKIN.

```sql
CREATE TABLE athlete_daily_vitals (
  athlete_id      UUID NOT NULL REFERENCES users(id),
  vitals_date     DATE NOT NULL,

  -- HRV
  hrv_morning_ms  DECIMAL(6,1),
  hrv_avg_ms      DECIMAL(6,1),

  -- Heart rate
  resting_hr_bpm  INT,

  -- Sleep (resolved: single value, source tracked)
  sleep_hours     DECIMAL(4,1),
  sleep_quality   DECIMAL(3,1),
  deep_sleep_min  INT,
  rem_sleep_min   INT,
  sleep_source    TEXT,  -- 'whoop' | 'manual' | 'checkin'

  -- Wellness (from checkin)
  energy          INT,
  soreness        INT,
  mood            INT,
  academic_stress INT,
  pain_flag       BOOLEAN DEFAULT FALSE,

  -- Wearable extras
  spo2_percent    DECIMAL(4,1),
  recovery_score  INT,
  steps           INT,
  active_calories INT,

  -- Computed (single formula, one place)
  readiness_score INT,
  readiness_rag   TEXT,  -- GREEN/AMBER/RED

  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (athlete_id, vitals_date)
);

CREATE INDEX idx_daily_vitals_athlete_date
  ON athlete_daily_vitals(athlete_id, vitals_date DESC);
```

**Written by**: New `dailyVitalsWriter.ts` — called from wellnessHandler, vitalHandler, sleepHandler.

**Eliminates**:
- `weeklyVitalsAggregator.ts` scanning raw `health_data`
- Sleep priority logic scattered across consumers
- Readiness computed in 3 different places

---

### 2. `athlete_benchmark_cache` — Cached Percentiles

One row per athlete. Currently `getPlayerBenchmarkProfile()` runs a full normative lookup on every call from boot, contextBuilder, and forYouService — 3x per session.

```sql
CREATE TABLE athlete_benchmark_cache (
  athlete_id          UUID PRIMARY KEY REFERENCES users(id),
  overall_percentile  INT,
  strengths           TEXT[],
  gaps                TEXT[],
  strength_attributes TEXT[],
  gap_attributes      TEXT[],
  results_json        JSONB,    -- full BenchmarkProfile
  age_band            TEXT,
  position            TEXT,
  computed_at         TIMESTAMPTZ DEFAULT now(),
  trigger_event_id    UUID
);
```

**Written by**: `assessmentHandler.ts` after ASSESSMENT_RESULT events. Reuses existing `getPlayerBenchmarkProfile()` logic but persists the result.

**Eliminates**: 3x redundant benchmark computation per session.

---

### 3. `athlete_weekly_digest` — Weekly Aggregation

One row per athlete per ISO week. Pre-aggregated from daily tables.

```sql
CREATE TABLE athlete_weekly_digest (
  athlete_id              UUID NOT NULL REFERENCES users(id),
  iso_year                INT NOT NULL,
  iso_week                INT NOT NULL,

  total_training_load_au  DECIMAL(10,1),
  total_academic_load_au  DECIMAL(10,1),
  session_count           INT,
  avg_hrv_ms              DECIMAL(6,1),
  avg_resting_hr          DECIMAL(5,1),
  avg_sleep_hours         DECIMAL(4,1),
  avg_energy              DECIMAL(3,1),
  avg_soreness            DECIMAL(3,1),
  avg_mood                DECIMAL(3,1),
  hrv_trend_pct           DECIMAL(5,1),
  load_trend_pct          DECIMAL(5,1),
  wellness_trend          TEXT,  -- IMPROVING/STABLE/DECLINING
  green_days              INT DEFAULT 0,
  amber_days              INT DEFAULT 0,
  red_days                INT DEFAULT 0,
  journal_completion_rate DECIMAL(3,2),

  computed_at             TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (athlete_id, iso_year, iso_week)
);
```

**Written by**: Lazy recompute (when stale >6h in `getAthleteState()`) + Sunday night cron.

---

### 4. `performance_rules` — CMS-Managed Rules

Externalizes the hardcoded `BUILT_IN_RULES` from `recommendationConfig.ts`. The Performance Director creates/edits rules via CMS Admin without code deploys.

```sql
CREATE TABLE performance_rules (
  rule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  emoji           TEXT,

  -- Rule type
  category        TEXT NOT NULL,
    -- 'guardrail' | 'recommendation' | 'program' | 'notification'

  -- Conditions: [{field, operator, value}]
  -- e.g. [{"field":"acwr","op":">","value":1.5},
  --        {"field":"readiness_rag","op":"=","value":"RED"}]
  conditions      JSONB NOT NULL,

  -- Actions: [{type, params}]
  -- e.g. [{"type":"generate_rec","params":{"priority":1,"title":"Deload Now"}}]
  actions         JSONB NOT NULL,

  priority        INT DEFAULT 100,
  sport_filter    TEXT[],         -- NULL = all sports
  phv_filter      TEXT[],         -- NULL = all PHV stages
  age_band_filter TEXT[],         -- NULL = all ages

  is_built_in     BOOLEAN DEFAULT FALSE,
  is_enabled      BOOLEAN DEFAULT TRUE,

  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rule_audit_log (
  log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL,
  rule_id         UUID NOT NULL REFERENCES performance_rules(rule_id),
  triggered_at    TIMESTAMPTZ DEFAULT now(),
  snapshot_values JSONB,    -- athlete's state when rule fired
  actions_taken   JSONB,    -- what happened as a result
  source_event_id UUID
);
```

---

## The Single Read API: `getAthleteState()`

**New file**: `backend/services/unified/getAthleteState.ts`

```typescript
interface GetAthleteStateOptions {
  role: 'ATHLETE' | 'COACH' | 'PARENT';
  vitalsWindowDays?: number;        // default 7
  includeCalendar?: boolean;        // default true
  calendarForwardDays?: number;     // default 7
  includeRecommendations?: boolean; // default true
  recLimit?: number;                // default 5
  includeMemory?: boolean;          // default false (AI only)
  includeRag?: boolean;             // default false (AI only)
  ragQuery?: string;                // for RAG retrieval
}

interface AthleteState {
  snapshot: Partial<AthleteSnapshot>;     // role-filtered
  profile: AthleteProfile;
  dailyVitals: AthleteDailyVitals[];      // last N days
  dailyLoad: AthleteDailyLoad[];          // last 28 days
  weeklyDigest: AthleteWeeklyDigest | null;
  benchmarkProfile: BenchmarkProfile | null;
  todayEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  activeRecommendations: Recommendation[];
  triggeredRules: TriggeredRule[];
  longitudinalMemory?: string;            // AI-only
  ragChunks?: KnowledgeChunk[];           // AI-only
  timezone: string;
  stateAt: string;
}
```

Every consumer calls this. **No consumer reads raw tables directly.**

### Consumer Migration Table

| Consumer | Current Approach | After Migration |
|----------|-----------------|----------------|
| Boot endpoint | 12 parallel raw-table queries | `getAthleteState(id, 'ATHLETE')` |
| contextBuilder (Chat) | 13 parallel raw-table queries | `getAthleteState(id, role, {includeMemory: true, includeRag: true})` |
| Deep Rec Refresh | 12 parallel queries | `getAthleteState(id, 'ATHLETE', {includeRag: true})` |
| RIE computers | `readSnapshot()` | `getAthleteState(id, 'ATHLETE', {includeCalendar: false})` |
| My Vitals | `weeklyVitalsAggregator` + `health_data` scan | `state.dailyVitals` (7 pre-aggregated rows) |
| Notifications | snapshot + event data | `getAthleteState(id, role, {vitalsWindowDays: 1})` |

### Query Reduction

| Consumer | Current Queries | After | Savings |
|----------|----------------|-------|---------|
| Boot endpoint | 12 parallel against raw tables | 6 against pre-aggregated | 50% fewer |
| contextBuilder (Chat) | 13 parallel against raw tables | 8 (includes memory + RAG) | 38% fewer |
| Weekly vitals | 1 large scan + in-memory aggregation | 7 row reads from daily_vitals | ~10x faster |
| Benchmark profile | Full normative lookup per call | 1 cache read | ~50x faster |

---

## RAG Placement

RAG is an **enrichment layer on top** of the unified data state, not part of it:

```
AthleteState (from getAthleteState)
       |
       v
AI Consumer (Chat Agent / Deep Refresh)
       |
       +-- RAG Retrieval (ragRetriever.ts -> pgvector search)
       |     Query built FROM AthleteState fields
       |     e.g. "ACWR 2.12 + RED readiness + U17 football"
       |     Returns: KnowledgeChunk[] (sports science evidence)
       |
       +-- Longitudinal Memory (athlete_longitudinal_memory)
       |     Goals, concerns, injury history, preferences
       |
       +-- Performance Rules (triggered rules from getAthleteState)
       |     CMS-configured guardrails and recommendations
       |
       +-- Claude API Call
             System prompt = State + RAG + Memory + Rules
             -> Structured response
```

**RAG feeds into**:
- Chat AI system prompts (evidence-backed coaching)
- Deep Rec Refresh (research-backed recommendations)
- Performance Director CMS (knowledge base management)

**RAG does NOT feed into**:
- RIE computers (deterministic, no AI needed)
- My Vitals display (data-only, no coaching narrative)
- Notification generation (template-based)

RAG is optionally included in `getAthleteState()` via `includeRag: true` for convenience, but conceptually it's query-time enrichment — not persistent athlete state.

---

## CMS Admin for Performance Director

### The Flow

```
Performance Director (CMS Admin)
       |
       +-- 1. Manage Rules (performance_rules table)
       |     Create/edit conditions + actions
       |     e.g. "IF acwr > 1.5 AND phv = MID -> P1 deload rec"
       |     Filter by sport, age band, PHV stage
       |
       +-- 2. Manage Knowledge Base (rag_knowledge_chunks)
       |     Upload/edit sports science content
       |     Tag by domain, sport, PHV, evidence grade
       |     View retrieval analytics (which chunks get used)
       |
       +-- 3. Review Rule Audit Log
       |     See which rules fired for which athletes
       |     Tune thresholds based on outcomes
       |
       +-- 4. View Athlete State Dashboard
             See any athlete's full AthleteState
             Understand WHY a recommendation was generated
```

### CMS Admin Pages (4 new)

| Page | Route | Purpose |
|------|-------|---------|
| Rule Builder | `/admin/rules` | CRUD for performance_rules, test against sample athletes |
| Knowledge Base | `/admin/knowledge` | CRUD for rag_knowledge_chunks, view usage stats |
| Rule Audit | `/admin/rules/audit` | Filter by athlete/rule/date, see triggeredRules + actions |
| Athlete Inspector | `/admin/athletes/:id/state` | View full AthleteState for any athlete |

### Admin API Endpoints (6 new)

```
GET    /api/v1/admin/rules              -- list rules (filterable)
POST   /api/v1/admin/rules              -- create rule
PUT    /api/v1/admin/rules/:id          -- update rule
DELETE /api/v1/admin/rules/:id          -- soft-delete
GET    /api/v1/admin/rules/audit        -- audit log (filterable)
GET    /api/v1/admin/athletes/:id/state -- full AthleteState view
```

### How Rules Feed Into Recommendations

```
Event arrives -> eventProcessor
  |
  +-- handlers update snapshot + daily tables (existing)
  |
  +-- evaluatePerformanceRules(athleteId, event)
        |
        +-- Load enabled rules from performance_rules (cached 5min)
        +-- Evaluate conditions against current snapshot
        +-- For each triggered rule:
        |     +-- Execute actions (generate_rec, notify, block_program, etc.)
        |     +-- Log to rule_audit_log
        |
        +-- Return triggeredRules[] (included in getAthleteState response)
```

This replaces the 9 hardcoded RIE computers over time. Built-in rules are seeded as `is_built_in: true` rows that the Performance Director can tune but not delete.

---

## Event Processor Enhancement

Existing `eventProcessor.ts` flow (**UNCHANGED**):
```
event -> route to handler -> handler computes -> writeSnapshot()
```

New additions after `writeSnapshot()`:
```
-> upsertDailyVitals()          (if wellness/vital/sleep event)
-> upsertBenchmarkCache()       (if assessment event)
-> evaluatePerformanceRules()   (always)
```

---

## File Structure

### New Files to Create

```
backend/services/
+-- unified/                           # NEW — Core unified layer
|   +-- getAthleteState.ts            # The single read API
|   +-- types.ts                      # AthleteState interface + options
|   +-- ruleEvaluator.ts             # CMS rule evaluation engine
|   +-- weeklyDigestComputer.ts      # Weekly aggregation logic
|
+-- events/
|   +-- aggregations/                  # NEW — Write-side aggregation
|   |   +-- dailyVitalsWriter.ts     # Sleep priority, readiness formula
|   |   +-- benchmarkCacheWriter.ts  # Persist benchmark computation
|   +-- eventProcessor.ts            # + evaluatePerformanceRules() call
|   +-- handlers/                    # Each gets dailyVitals upsert call
|
+-- admin/
|   +-- ruleAdminService.ts          # NEW — CRUD for performance_rules
```

### Existing Files to Modify

| File | Change |
|------|--------|
| `backend/services/events/eventProcessor.ts` | Add dailyVitals upsert + rule evaluation calls |
| `backend/services/events/handlers/wellnessHandler.ts` | Call `dailyVitalsWriter` |
| `backend/services/events/handlers/vitalHandler.ts` | Call `dailyVitalsWriter` |
| `backend/services/events/handlers/assessmentHandler.ts` | Call `benchmarkCacheWriter` |
| `backend/services/agents/contextBuilder.ts` | Delegate to `getAthleteState()` |
| `backend/app/api/v1/boot/route.ts` | Replace 12 queries with `getAthleteState()` |
| `backend/app/api/v1/output/snapshot/route.ts` | Read from `dailyVitals` instead of `weeklyVitalsAggregator` |
| `backend/services/recommendations/computers/*.ts` | Use `getAthleteState()` instead of `readSnapshot()` |
| `backend/services/recommendations/recommendationConfig.ts` | Migrate BUILT_IN_RULES to DB seeds |

---

## Migration Path (Zero-Downtime, 5 Phases)

### Phase 1: Add Tables + Backfill (Week 1-2)
- Supabase migration for 5 new tables
- Backfill `athlete_daily_vitals` from health_data + checkins + sleep_logs
- Backfill `athlete_benchmark_cache` from existing benchmark computation
- Backfill `athlete_weekly_digest` for last 12 weeks
- Seed `performance_rules` from hardcoded BUILT_IN_RULES
- **Risk: Zero** — additive only, no existing code changes

### Phase 2: Dual-Write Handlers (Week 2-3)
- Modify wellness/vital/assessment handlers to ALSO write new tables
- Add `evaluatePerformanceRules()` to event processor
- Validate new tables match existing data for 1-2 weeks
- **Risk: Very low** — existing writes unchanged, new writes added alongside

### Phase 3: Build getAthleteState() + Rule Engine (Week 3-4)
- Implement `getAthleteState()` reading only from pre-aggregated tables
- Implement `ruleEvaluator.ts`
- Shadow-mode in boot endpoint (call both old + new, log differences)
- **Risk: Zero** — no consumer switched yet

### Phase 4: Migrate Consumers (Week 4-6)
One PR per consumer, each independently reversible:
1. Boot endpoint -> `getAthleteState()`
2. contextBuilder -> delegates to `getAthleteState()`
3. My Vitals -> reads `state.dailyVitals`
4. Own It / RIE computers -> `getAthleteState()`
5. Deep Refresh -> inherits via contextBuilder
6. Notifications -> `getAthleteState()`

### Phase 5: Deprecate + CMS Admin (Week 6-8)
- Remove direct raw-table reads from services
- Remove `weeklyVitalsAggregator.ts`
- Build CMS Admin pages (Rule Builder, Knowledge Base, Audit, Inspector)
- ESLint rule warning on direct raw-table queries outside event handlers

---

## Verification Strategy

### Phase 1-2
- Compare `athlete_daily_vitals` rows with `health_data` + `checkins` for same dates
- Verify sleep source priority (Whoop > manual > checkin) resolves correctly
- Run benchmark cache vs live computation — results must match

### Phase 3
- Shadow-mode logging: boot endpoint calls both old (12 queries) and new (getAthleteState), logs any differences
- Run Chat eval harness (`npx tsx scripts/chat-test-runner.ts --eval --suite s1,s2,s3`)

### Phase 4
- Each consumer PR: A/B test response payloads (old vs new) for 10 athletes
- My Vitals: HRV, sleep, readiness must match across Chat and Own It
- RIE: Recommendations must be identical before and after migration

### Phase 5
- CMS Admin: Create a rule via UI, trigger it with test data, verify audit log
- ESLint: No direct raw-table reads in consumer services
- Full eval harness: 95 scenarios, all 8 suites

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Expand Layer 2, don't replace it | Event-sourced pipeline is sound. Only the read surface is incomplete. |
| Daily granularity for vitals | For young athletes with consumer wearables, daily captures all meaningful signals. |
| Lazy + scheduled for weekly digest | Computing on every event is wasteful. Lazy (>6h stale) + Sunday cron covers all cases. |
| Performance rules in DB, not code | Performance Director must tune thresholds without code deploys. |
| RAG as enrichment, not state | RAG results are ephemeral and context-dependent. Not persistent athlete state. |
| Single read function for all consumers | Eliminates the root cause of contradictions. One interpretation of athlete state. |
