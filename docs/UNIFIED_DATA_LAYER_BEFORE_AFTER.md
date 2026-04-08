# Tomo Unified Data Layer — Before & After

> April 8, 2026 — Companion to `UNIFIED_DATA_LAYER_ARCHITECTURE.md`

---

## 1. The Core Change in One Sentence

**Before**: 6 consumers independently query 8+ raw tables, each assembling its own interpretation of the athlete.
**After**: 1 function reads from 5 pre-aggregated tables, every consumer gets the same answer.

---

## 2. Data Flow — Before (Current)

```
                         RAW TABLES
  +----------+  +-------------+  +----------------+  +-----------+
  | checkins |  | health_data |  | calendar_events|  | athlete   |
  |          |  | (wearable)  |  |                |  | _events   |
  +----+-----+  +------+------+  +-------+--------+  +-----+-----+
       |               |                 |                  |
       |               |                 |                  |
       v               v                 v                  v
  +----------------------------------------------------------------+
  | Event Processor -> Handlers -> writeSnapshot()                  |
  +----------------------------------------------------------------+
       |
       v
  +--------------------+     +-------------------+
  | athlete_snapshots  |     | athlete_daily_load|
  | (~35 fields)       |     | (per-day buckets) |
  +--------+-----------+     +---------+---------+
           |                           |
           |   BUT consumers also      |
           |   read RAW tables         |
           |   directly...             |
           |                           |
  +--------v---------------------------v-----------+
  |                                                |
  |  EACH CONSUMER BUILDS ITS OWN VIEW:           |
  |                                                |
  |  +------------------------------------------+  |
  |  | Boot Endpoint (12 parallel queries)      |  |
  |  | Reads: snapshot + checkins + health_data |  |
  |  |   + calendar_events + users + sleep_logs |  |
  |  |   + schedule_preferences                 |  |
  |  +------------------------------------------+  |
  |                                                |
  |  +------------------------------------------+  |
  |  | contextBuilder (13 parallel queries)     |  |
  |  | Reads: snapshot + checkins + health_data |  |
  |  |   + calendar_events + users + test_results|  |
  |  |   + recommendations + benchmarkService() |  |
  |  +------------------------------------------+  |
  |                                                |
  |  +------------------------------------------+  |
  |  | My Vitals (weeklyVitalsAggregator)       |  |
  |  | Reads: health_data (full 7-day scan)     |  |
  |  |   + checkins (energy/soreness)           |  |
  |  |   + snapshot (timestamps only!)          |  |
  |  | Does NOT read: ACWR, injury_risk         |  |
  |  +------------------------------------------+  |
  |                                                |
  |  +------------------------------------------+  |
  |  | RIE Computers (readSnapshot only)        |  |
  |  | Reads: snapshot                          |  |
  |  +------------------------------------------+  |
  |                                                |
  |  +------------------------------------------+  |
  |  | Deep Rec Refresh (full PlayerContext)     |  |
  |  | Reads: everything contextBuilder reads   |  |
  |  |   + RAG chunks + longitudinal memory     |  |
  |  +------------------------------------------+  |
  |                                                |
  |  +------------------------------------------+  |
  |  | Notifications                            |  |
  |  | Reads: snapshot + event data             |  |
  |  +------------------------------------------+  |
  |                                                |
  +------------------------------------------------+
```

### What Goes Wrong (Real Example from Screenshots)

```
ATHLETE STATE: ACWR = 2.12, injury_risk = RED, energy = 4/5, HRV = 63.2ms

  My Vitals reads:
    health_data -> HRV 63.2ms
    checkins -> energy 4/5
    snapshot -> (only timestamps, NOT acwr or injury_risk)
    buildRichContextInsight() -> "High energy — ready for quality session"
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  DANGEROUS — ignores RED injury risk

  Chat reads:
    snapshot -> ACWR 2.12, injury_risk RED
    snapshot -> hrv_today_ms 86ms (STALE — different from health_data 63.2ms)
    snapshot -> hrv_baseline_ms 122ms
    AI generates -> "ACWR 2.12 — deload 3-5 days, injury risk zone"

  Own It reads:
    snapshot -> ACWR 2.12, readiness_rag RED
    RIE loadWarningComputer -> "Training Spike Detected — URGENT"
    RIE readinessComputer -> "High Load + Low Readiness — URGENT"

  RESULT: Three different messages. One says train, two say stop.
```

### Why It Happens — The Query Matrix

| Data Point | Boot | Chat | My Vitals | RIE | Deep Rec | Notif |
|-----------|------|------|-----------|-----|----------|-------|
| **HRV** | health_data | snapshot.hrv_today_ms | health_data | — | snapshot | — |
| **Sleep** | Whoop > checkin | health_data | health_data | — | health_data | — |
| **Energy** | checkins | checkins | checkins | — | checkins | — |
| **ACWR** | snapshot | snapshot | **NOT READ** | snapshot | snapshot | snapshot |
| **Readiness** | checkins (recompute) | snapshot | **energy only** | snapshot | snapshot | snapshot |
| **Benchmarks** | benchmarkService() | benchmarkService() | — | — | benchmarkService() | — |

- 6 consumers, each with its own query set
- HRV read from 2 different tables (health_data vs snapshot)
- Sleep resolved with different priority logic per consumer
- Benchmarks recomputed 3x per session
- My Vitals completely blind to ACWR and injury risk

---

## 3. Data Flow — After (Unified)

```
                         RAW TABLES (unchanged)
  +----------+  +-------------+  +----------------+  +-----------+
  | checkins |  | health_data |  | calendar_events|  | athlete   |
  |          |  | (wearable)  |  |                |  | _events   |
  +----+-----+  +------+------+  +-------+--------+  +-----+-----+
       |               |                 |                  |
       v               v                 v                  v
  +----------------------------------------------------------------+
  | Event Processor -> Handlers -> writeSnapshot()                  |
  |                                                                 |
  | NEW: also writes to companion tables:                           |
  |   +-- upsertDailyVitals()      (wellness/vital/sleep events)   |
  |   +-- upsertBenchmarkCache()   (assessment events)             |
  |   +-- evaluatePerformanceRules() (all events)                  |
  +----------------------------------------------------------------+
       |
       v
  +================================================================+
  ||              UNIFIED ATHLETE STATE                            ||
  ||                                                               ||
  ||  +--------------------+     +-------------------+             ||
  ||  | athlete_snapshots  |     | athlete_daily_load|             ||
  ||  | (~60 fields)       |     | (per-day buckets) |             ||
  ||  | EXISTING           |     | EXISTING          |             ||
  ||  +--------------------+     +-------------------+             ||
  ||                                                               ||
  ||  +---------------------+    +------------------------+        ||
  ||  | athlete_daily_vitals|    | athlete_benchmark_cache|        ||
  ||  | (per-day rollups)   |    | (cached percentiles)   |        ||
  ||  | NEW                 |    | NEW                     |        ||
  ||  +---------------------+    +------------------------+        ||
  ||                                                               ||
  ||  +---------------------+    +-------------------+             ||
  ||  | athlete_weekly      |    | performance_rules |             ||
  ||  | _digest             |    | (CMS-managed)     |             ||
  ||  | NEW                 |    | NEW                |             ||
  ||  +---------------------+    +-------------------+             ||
  ||                                                               ||
  +========================+=======================================+
                           |
                           v
  +--------------------------------------------------------+
  |                                                        |
  |  getAthleteState(athleteId, role, options)              |
  |                                                        |
  |  SINGLE FUNCTION — reads ONLY from pre-aggregated      |
  |  tables above. Never touches raw tables.               |
  |                                                        |
  |  Returns: AthleteState {                               |
  |    snapshot,           // point-in-time (~60 fields)   |
  |    dailyVitals[],      // 7-day window (7 rows)        |
  |    dailyLoad[],        // 28-day window (28 rows)      |
  |    weeklyDigest,       // this week's aggregation      |
  |    benchmarkProfile,   // cached percentiles           |
  |    todayEvents[],      // from calendar_events         |
  |    upcomingEvents[],   // next 7 days                  |
  |    activeRecs[],       // from athlete_recommendations |
  |    triggeredRules[],   // from performance_rules eval  |
  |    memory?,            // AI consumers only            |
  |    ragChunks?,         // AI consumers only            |
  |  }                                                     |
  |                                                        |
  +---------------------------+----------------------------+
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
  +--------------+   +--------------+   +--------------+
  | Boot         |   | Chat AI      |   | My Vitals    |
  | Endpoint     |   | (context     |   | Screen       |
  |              |   |  Builder)    |   |              |
  | getAthlete   |   | getAthlete   |   | getAthlete   |
  | State(id,    |   | State(id,    |   | State(id,    |
  |  'ATHLETE')  |   |  role, {     |   |  'ATHLETE',  |
  |              |   |  memory:true |   |  {vitals     |
  |              |   |  rag: true}) |   |  Window: 7}) |
  +--------------+   +--------------+   +--------------+
          |                   |                   |
          v                   v                   v
  +--------------+   +--------------+   +--------------+
  | Own It /     |   | Deep Rec     |   | Notification |
  | RIE          |   | Refresh      |   | Engine       |
  |              |   |              |   |              |
  | getAthlete   |   | getAthlete   |   | getAthlete   |
  | State(id,    |   | State(id,    |   | State(id,    |
  |  'ATHLETE',  |   |  'ATHLETE',  |   |  role, {     |
  |  {calendar:  |   |  {rag: true})|   |  vitals      |
  |   false})    |   |              |   |  Window: 1}) |
  +--------------+   +--------------+   +--------------+
```

### Same Scenario — After Fix

```
ATHLETE STATE: ACWR = 2.12, injury_risk = RED, energy = 4/5, HRV = 63.2ms

  ALL consumers call getAthleteState() which returns:
    snapshot.acwr = 2.12
    snapshot.injury_risk_flag = "RED"
    snapshot.readiness_rag = "RED"
    dailyVitals[today].hrv_morning_ms = 63.2    <-- single source
    dailyVitals[today].energy = 4
    dailyVitals[today].readiness_rag = "RED"    <-- computed once
    dailyVitals[today].sleep_hours = 5.8        <-- resolved once (Whoop)
    dailyVitals[today].sleep_source = "whoop"
    triggeredRules = [
      { name: "Training Spike", priority: 1, action: "deload_rec" },
      { name: "High Load + Low Readiness", priority: 1, action: "rest_rec" }
    ]

  My Vitals renders:
    HRV 63.2ms — "Training load is high (ACWR 2.1) — prioritize recovery"
                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                  NOW COHERENT — reads ACWR from same state as Chat/Own It

  Chat generates:
    Uses same 63.2ms HRV (not stale 86ms from old snapshot)
    Uses same ACWR 2.12 and RED flags
    "Your ACWR is 2.12 — deload for 3-5 days"

  Own It renders:
    Same triggeredRules → "Training Spike Detected — URGENT"
    Same ACWR 2.12 and readiness RED

  RESULT: Three surfaces, ONE coherent message. All say recovery.
```

---

## 4. Per-Consumer Before/After Comparison

### Boot Endpoint

| Aspect | Before | After |
|--------|--------|-------|
| Queries | 12 parallel against raw tables | 1 call to `getAthleteState()` (~6 internal queries against pre-aggregated tables) |
| HRV source | `health_data` (raw) | `dailyVitals[today].hrv_morning_ms` (pre-aggregated) |
| Sleep source | Whoop > checkin (priority logic inline) | `dailyVitals[today].sleep_hours` + `sleep_source` (resolved once by writer) |
| Benchmarks | `getPlayerBenchmarkProfile()` (full normative lookup) | `benchmarkCache` (1 row read) |
| Latency | ~200ms (12 parallel DB calls) | ~80ms (6 calls against indexed, small tables) |

### Chat AI (contextBuilder → agents)

| Aspect | Before | After |
|--------|--------|-------|
| Queries | 13 parallel (raw tables + snapshot) | 1 call to `getAthleteState({includeMemory: true, includeRag: true})` (~8 internal queries) |
| HRV | `snapshot.hrv_today_ms` (potentially stale 86ms) | `dailyVitals[today].hrv_morning_ms` (63.2ms — fresh, matches My Vitals) |
| Sleep | `health_data` (raw, 3-day window) | `dailyVitals[0..2].sleep_hours` (pre-resolved) |
| Readiness | Derived from raw `checkins` + snapshot mix | `snapshot.readiness_rag` + `dailyVitals[today].readiness_rag` (single computation) |
| Benchmarks | `getPlayerBenchmarkProfile()` (full recompute) | `benchmarkCache.results_json` (cached) |
| Rules | Hardcoded in agent prompts | `triggeredRules[]` from CMS-managed `performance_rules` |
| PlayerContext type | **Unchanged** — same interface, different implementation | Same `PlayerContext` type, populated from `AthleteState` |

### My Vitals Screen

| Aspect | Before | After |
|--------|--------|-------|
| Data source | `health_data` (raw scan) + `weeklyVitalsAggregator` | `state.dailyVitals[]` (7 pre-aggregated rows) |
| HRV value | 63.2ms from `health_data` | 63.2ms from `dailyVitals[today]` — **same value, now matches Chat** |
| ACWR awareness | **NONE** — `buildRichContextInsight()` never checked ACWR | `snapshot.acwr` + `snapshot.injury_risk_flag` always available |
| Insight generation | Energy-only template → "ready for quality session" | ACWR/readiness-aware → "prioritize recovery, not intensity" |
| Sleep | `health_data` (raw) | `dailyVitals[today].sleep_hours` (resolved, with `sleep_source`) |
| Weekly trends | In-memory aggregation of 50+ raw `health_data` rows | `AVG(dailyVitals[0..6].hrv_morning_ms)` — 7 row reads |

### RIE Computers (9 recommendation engines)

| Aspect | Before | After |
|--------|--------|-------|
| Data source | `readSnapshot()` only | `getAthleteState(id, 'ATHLETE', {includeCalendar: false})` |
| Rules | Hardcoded decision trees in each computer | `performance_rules` table (CMS-managed, same decision logic) |
| Audit trail | None | `rule_audit_log` — every fired rule logged with snapshot values |
| Tuning | Requires code deploy | Performance Director edits via CMS Admin |

### Deep Rec Refresh (Claude-powered)

| Aspect | Before | After |
|--------|--------|-------|
| Context assembly | Calls `buildPlayerContext()` (13 raw queries) | Inherits from contextBuilder → `getAthleteState()` |
| RAG | Separate retrieval step | `getAthleteState({includeRag: true})` — bundled |
| Rules context | None — Claude invents its own guardrails | `triggeredRules[]` included — Claude respects CMS rules |

### Notification Engine

| Aspect | Before | After |
|--------|--------|-------|
| Data source | snapshot + raw event data | `getAthleteState(id, role, {vitalsWindowDays: 1})` |
| Coherence | Could generate notification that contradicts Own It card | Same `triggeredRules[]` → notifications align with recs |

---

## 5. Data Source Resolution — Before/After

### HRV

```
BEFORE:
  health_data.value (metric_type='hrv')     --> My Vitals shows 63.2ms
  athlete_snapshots.hrv_today_ms            --> Chat shows 86ms (STALE)
  athlete_snapshots.hrv_baseline_ms         --> Chat shows 122ms (28-day avg)
  Two sources, two values, consumers choose differently.

AFTER:
  dailyVitalsWriter resolves on every VITAL_READING event:
    athlete_daily_vitals.hrv_morning_ms = 63.2  (latest wearable reading)
  athlete_snapshots.hrv_today_ms = 63.2         (synced by writer)
  athlete_snapshots.hrv_baseline_ms = 122       (28-day rolling, unchanged)
  One value everywhere. Snapshot and daily vitals always in sync.
```

### Sleep

```
BEFORE:
  checkins.sleep_hours = 6.5        (manual entry)
  health_data.value (sleep) = 5.8   (Whoop wearable)
  sleep_logs.duration_hours = 5.8   (detailed log)
  Three sources. Boot picks Whoop > checkin. Chat reads health_data.
  My Vitals reads health_data. No one reads sleep_logs.
  Priority logic duplicated in 3 places.

AFTER:
  dailyVitalsWriter resolves ONCE with priority: WEARABLE > SLEEP_LOG > CHECKIN
    athlete_daily_vitals.sleep_hours = 5.8
    athlete_daily_vitals.sleep_source = 'whoop'
  Every consumer reads the same 5.8 from dailyVitals.
  Priority logic lives in ONE file: dailyVitalsWriter.ts
```

### Readiness

```
BEFORE:
  readinessCalculator.ts      --> GREEN/YELLOW/RED (pure function, used by check-in flow)
  wellnessHandler.ts          --> readiness_score + readiness_rag (written to snapshot)
  outputAgent.log_check_in()  --> inline formula (energy + soreness + sleep + mood)
  buildRichContextInsight()   --> energy >= 4 → "ready for quality session" (ignores ACWR!)
  3-4 places computing readiness with slightly different logic.

AFTER:
  dailyVitalsWriter.ts computes readiness ONCE per checkin/vital event:
    athlete_daily_vitals.readiness_score = 42
    athlete_daily_vitals.readiness_rag = "RED"
  athlete_snapshots.readiness_rag = "RED" (synced)
  getAthleteState() returns both.
  buildRichContextInsight() reads from snapshot (has ACWR + injury_risk).
  readinessCalculator.ts remains as pure function used by dailyVitalsWriter.
  One formula, one result, everywhere.
```

### Benchmarks

```
BEFORE:
  getPlayerBenchmarkProfile(userId) called from:
    1. boot/route.ts          --> full normative lookup (~50ms)
    2. contextBuilder.ts      --> full normative lookup (~50ms)
    3. forYouService.ts       --> full normative lookup (~50ms)
  Same computation runs 3x per session. Never cached.

AFTER:
  assessmentHandler.ts writes to athlete_benchmark_cache on ASSESSMENT_RESULT.
  getAthleteState() reads 1 row from cache (~1ms).
  Computation runs ONCE when test results change, not on every page load.
```

---

## 6. Query Count — Before/After

### Single Page Load (e.g., athlete opens app)

```
BEFORE:
  Boot endpoint:        12 queries  (raw tables)
  My Vitals:             8 queries  (health_data scan + aggregation)
  Own It:                3 queries  (snapshot + recs + stale check)
  ─────────────────────────────────
  TOTAL:                23 queries against raw + aggregated tables

  If athlete opens Chat:
  contextBuilder:       13 queries  (raw tables + snapshot)
  ─────────────────────────────────
  GRAND TOTAL:          36 queries per session start

AFTER:
  Boot endpoint:         1 call → getAthleteState() → 6 internal queries (pre-aggregated)
  My Vitals:             0 extra  (uses boot data — dailyVitals already loaded)
  Own It:                0 extra  (uses boot data — recs + triggeredRules loaded)
  ─────────────────────────────────
  TOTAL:                 6 queries against pre-aggregated tables

  If athlete opens Chat:
  contextBuilder:        1 call → getAthleteState({memory, rag}) → 8 internal queries
  ─────────────────────────────────
  GRAND TOTAL:          14 queries per session start

  REDUCTION:            36 → 14 queries (61% fewer)
  SPEED:                All queries against small, indexed tables (not raw scans)
```

---

## 7. The "Would This Have Prevented The Bug?" Test

Original bug: My Vitals said "ready for quality session" while ACWR was 2.12 (RED).

```
BEFORE:
  buildRichContextInsight() received snapshot with ONLY:
    snapshot_at, last_checkin_at, hrv_recorded_at, sleep_recorded_at
  It checked: energy >= 4 → "ready for quality session"
  It had NO access to ACWR or injury_risk_flag.
  → BUG: Dangerous advice given.

AFTER:
  buildRichContextInsight() receives AthleteState which includes:
    snapshot.acwr = 2.12
    snapshot.injury_risk_flag = "RED"
    snapshot.readiness_rag = "RED"
    dailyVitals[today].readiness_rag = "RED"
    triggeredRules = [{ name: "Training Spike", priority: 1 }]

  The function checks loadDanger BEFORE energy:
    if (injury_risk === "RED" || acwr > 1.5) →
      "Training load is high (ACWR 2.1) — prioritize recovery, not intensity"

  Energy check (>= 4 → "ready for quality session") is ONLY reached
  when loadDanger=false AND loadWarning=false AND readinessLow=false.

  → BUG IMPOSSIBLE: Safety guardrails always evaluated first.
```

---

## 8. Summary Table

| Dimension | Before (Current) | After (Unified) |
|-----------|-----------------|-----------------|
| **Read sources** | 6 consumers query 8+ tables independently | 1 function, 5 pre-aggregated tables |
| **HRV value** | 2 sources (63.2ms vs 86ms) | 1 source (63.2ms everywhere) |
| **Sleep resolution** | 3 tables, priority logic in 3 places | 1 table, priority in 1 writer |
| **Readiness formula** | Computed in 3-4 places | Computed once in dailyVitalsWriter |
| **Benchmarks** | Recomputed 3x/session | Cached, recomputed on test events only |
| **ACWR visibility** | Missing from My Vitals | Available to all consumers |
| **Recommendation rules** | Hardcoded in 9 RIE computers | CMS-managed `performance_rules` table |
| **Rule audit trail** | None | `rule_audit_log` with snapshot values |
| **Queries per session** | 36 (raw table scans) | 14 (pre-aggregated reads) |
| **Contradictions possible** | Yes — each surface has different data | No — single state, single interpretation |
| **Performance Director** | Must deploy code to tune thresholds | Edits rules in CMS Admin |
| **RAG integration** | Ad-hoc, separate from state | Enrichment layer on top of AthleteState |
