# Athlete Snapshot 360 Enhancement — Gap Analysis & Recommendations

> **Date**: April 9, 2026
> **Current State**: 39 snapshot fields (26 non-meta, 1 derived)
> **Target**: 80+ fields for true 360-degree athlete view
> **Principle**: Only snapshot data that EXISTS in the codebase today — no new data collection

---

## Current Snapshot Coverage

```
TODAY'S SNAPSHOT (39 fields)
├── Identity & Profile (7)     ✅ Covered
├── Readiness & Vitals (6)     ⚠️ Partial — missing SpO2, temp, recovery, sleep stages
├── Load Metrics (7)           ✅ Covered
├── Performance/CV (8)         ⚠️ Partial — missing benchmarks, drill data, competition
├── Wellness (3)               ⚠️ Partial — missing pain tracking, checkin components
├── Journal (6)                ✅ Covered
├── Engagement & Behavior (0)  ❌ Zero fields
├── Schedule & Compliance (0)  ❌ Zero fields
├── Academic Detail (0)        ❌ Zero fields (only academic_load_7day)
├── Trends & Trajectory (0)    ❌ Zero fields (only wellness_trend)
└── Meta (3)                   ✅ Covered
```

**The biggest gaps are: Engagement/Behavioral data, Trends, Schedule context, Vitals detail, and CV/Recruiting state.** All of this data already exists in raw tables.

---

## Tier 1 — High Impact (Transforms coaching & AI quality)

These fields are computed by existing handlers or queryable from existing tables, and would immediately improve AI coaching, PDIL protocols, and coach/parent dashboards.

### 1A. Vitals Enrichment (6 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `spo2_pct` | number | `health_data` (blood_oxygen) | Altitude training, illness detection, overtraining |
| `skin_temp_c` | number | `health_data` (body_temp) | Illness/infection early warning, 24h before HRV dips |
| `recovery_score` | number | `health_data` (recovery_score from WHOOP) | Wearable's own readiness assessment |
| `sleep_hours` | number | `health_data` / `sleep_logs` | Raw sleep duration (snapshot only has quality 0-10) |
| `sleep_consistency_score` | number | Computed: stddev of sleep_hours over 7d | Irregular sleep = injury predictor in youth athletes |
| `sleep_debt_3d` | number | Computed: sum(8 - actual) over 3 nights | Cumulative deficit directly impacts next-day readiness |

**Handler**: `vitalHandler.ts` already reads these from `health_data` but only writes `hrv_today_ms`, `hrv_baseline_ms`, `resting_hr_bpm`, `sleep_quality` to snapshot. Extend it.

### 1B. Trend Fields (6 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `hrv_trend_7d_pct` | number | Computed: (avg_last_3d / avg_prev_4d - 1) * 100 | HRV trajectory — coaches see direction, not just today |
| `load_trend_7d_pct` | number | Computed from `athlete_daily_load` | Load trajectory — ascending = fatigue risk |
| `readiness_distribution_7d` | json | Computed: `{green: N, amber: N, red: N}` | Week quality at a glance — 5 red days = crisis |
| `acwr_trend` | string | Computed: IMPROVING/STABLE/DECLINING from last 3 ACWR values | ACWR direction matters as much as absolute value |
| `sleep_trend_7d` | string | Computed: IMPROVING/STABLE/DECLINING | Sleep trajectory for weekly reviews |
| `body_feel_trend_7d` | number | Computed: avg of `training_journals.post_body_feel` over 7d | Post-session fatigue trend (1-10) — declining = overtrain |

**Handler**: Extend `wellnessHandler` and `sessionHandler` to compute these rolling values.

### 1C. Schedule & Context (5 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `matches_next_7d` | number | `calendar_events` WHERE event_type='match' | Match density changes load prescription |
| `exams_next_14d` | number | `calendar_events` WHERE event_type='exam' | Exam proximity triggers academic mode |
| `in_exam_period` | boolean | `player_schedule_preferences.exam_period_active` | Binary exam mode flag — coaches need this instantly |
| `sessions_scheduled_next_7d` | number | `calendar_events` training types | Planned load ahead |
| `days_since_last_session` | number | Computed from `last_session_at` | Detraining detection — >3 days = flag |

**Handler**: Compute in `writeSnapshot()` with a lightweight calendar query (already done in boot endpoint).

### 1D. Injury Detail (3 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `active_injury_count` | number | `athlete_events` WHERE INJURY_FLAG and no matching INJURY_CLEARED | Multiple concurrent injuries = different protocol |
| `injury_locations` | json | Array of locations from active INJURY_FLAG events | "Left hamstring + Right ankle" vs just "RED" flag |
| `days_since_injury` | number | Days since most recent INJURY_FLAG | RTP timeline context |

**Handler**: `injuryHandler` already processes these events — extend to write to snapshot.

---

## Tier 2 — Engagement & Behavioral (unlocks personalization)

These fields reveal HOW the athlete engages with Tomo, which is critical for coachability scoring, AI tone calibration, and parent/coach visibility.

### 2A. Chat & App Engagement (5 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `chat_sessions_7d` | number | `chat_sessions` count last 7d | Active coaching engagement — 0 = disengaged |
| `chat_messages_7d` | number | `chat_messages` count last 7d | Depth of engagement |
| `last_chat_at` | string | `chat_sessions.updated_at` MAX | Recency of AI interaction |
| `rec_action_rate_30d` | number | `athlete_recommendations` WHERE acted / total 30d | Does the athlete follow guidance? Key coachability metric |
| `notification_action_rate_7d` | number | `athlete_notifications` acted / delivered 7d | Responsiveness to system nudges |

**Computation**: Simple COUNT/AVG queries on existing tables. Compute in a periodic snapshot enrichment job or on WELLNESS_CHECKIN events.

### 2B. Drill & Program Engagement (4 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `drills_completed_7d` | number | `user_drill_history` count 7d | Training engagement beyond scheduled sessions |
| `avg_drill_rating_30d` | number | `user_drill_history.rating` AVG 30d | Self-assessment trend — declining = motivation loss |
| `active_program_count` | number | `program_interactions` WHERE active | How many programs athlete is following |
| `program_compliance_rate` | number | Completed / assigned programs over 30d | Execution vs intention |

### 2C. Compliance & Consistency (4 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `plan_compliance_7d` | number | `compliance_records` or calendar event completion rate | Did they do what was planned? |
| `checkin_consistency_7d` | number | Days with checkin / 7 | Checkin adherence — 100% = dialed in |
| `total_points_7d` | number | `points_ledger` SUM last 7d | Gamification velocity |
| `longest_streak` | number | `users.longest_streak` | Historical best (motivational anchor) |

---

## Tier 3 — Depth & Richness (completes the 360 view)

### 3A. Academic Enrichment (3 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `study_hours_7d` | number | `calendar_events` WHERE event_type='study' duration sum | Academic effort visibility |
| `academic_stress_latest` | number | `checkins.academic_stress` (1-10) | Most recent academic stress rating |
| `exam_count_active` | number | `player_schedule_preferences.exam_schedule` active entries | How many exams ahead |

### 3B. CV & Recruiting (4 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `cv_views_total` | number | `cv_share_views` COUNT | Recruitment interest signal |
| `cv_views_7d` | number | `cv_share_views` COUNT last 7d | Recent recruitment momentum |
| `cv_statement_status` | string | `cv_profiles.statement_status` (draft/approved/needs_update) | CV readiness for sharing |
| `cv_sections_complete` | json | Counts per section: career, academic, media, references, traits | Section-level completeness |

### 3C. Benchmark & Performance (3 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `overall_percentile` | number | `athlete_benchmark_cache.overall_percentile` | Where athlete stands vs peers |
| `top_strengths` | json | `athlete_benchmark_cache.strengths[]` (top 3) | AI can reference specific strengths |
| `key_gaps` | json | `athlete_benchmark_cache.gaps[]` (bottom 3) | AI targets development areas |

### 3D. Longitudinal AI Context (3 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `active_goals_count` | number | `athlete_longitudinal_memory.currentGoals` length | Goal-directed behavior indicator |
| `unresolved_concerns_count` | number | `athlete_longitudinal_memory.unresolvedConcerns` length | Open issues needing attention |
| `coaching_preference` | string | `athlete_longitudinal_memory.coachingPreferences` | AI tone calibration |

### 3E. Wearable Status (2 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `wearable_connected` | boolean | `wearable_connections` WHERE status='active' | Data confidence modifier |
| `wearable_last_sync_at` | string | `wearable_connections.last_sync_at` | Stale wearable = lower confidence on vitals |

### 3F. Journal Quality (3 new fields)

| Field | Type | Source | Why |
|-------|------|--------|-----|
| `pre_journal_completion_rate` | number | Pre-journals / scheduled sessions 7d | Target-setting behavior |
| `post_journal_completion_rate` | number | Post-journals / completed sessions 7d | Reflection behavior |
| `avg_post_body_feel_7d` | number | `training_journals.post_body_feel` AVG 7d | Physical fatigue self-report trend |

---

## Summary: Current vs Proposed

| Category | Current Fields | Proposed New | Total |
|----------|---------------|-------------|-------|
| Identity & Profile | 7 | 0 | 7 |
| Readiness & Vitals | 6 | **6** | 12 |
| Load Metrics | 7 | 0 | 7 |
| Trends & Trajectory | 1 (wellness_trend) | **6** | 7 |
| Schedule & Context | 0 | **5** | 5 |
| Injury Detail | 1 (injury_risk_flag) | **3** | 4 |
| Engagement & Behavior | 0 | **9** | 9 |
| Compliance & Consistency | 1 (streak_days) | **4** | 5 |
| Performance/CV | 8 | **7** | 15 |
| Academic | 1 (academic_load_7day) | **3** | 4 |
| Journal Quality | 6 | **3** | 9 |
| Longitudinal/AI | 0 | **3** | 3 |
| Wearable | 0 | **2** | 2 |
| Meta | 3 | 0 | 3 |
| **TOTAL** | **39** | **+51** | **~90** |

---

## Implementation Approach

### Step 1: Migration — Add columns to `athlete_snapshots`

One migration adding ~51 new columns. All nullable with sensible defaults. No breaking changes.

### Step 2: Extend Snapshot Field Registry

Add each new field to `SNAPSHOT_COLUMNS` in `snapshotFieldRegistry.ts`. They automatically appear in CMS Rule Builder UI.

### Step 3: Extend Event Handlers

| Handler | New Fields Written |
|---------|-------------------|
| `vitalHandler` | spo2_pct, skin_temp_c, recovery_score, sleep_hours |
| `wellnessHandler` | sleep_debt_3d, sleep_consistency_score, academic_stress_latest, checkin_consistency_7d |
| `sessionHandler` | load_trend_7d_pct, days_since_last_session, body_feel_trend_7d |
| `injuryHandler` | active_injury_count, injury_locations, days_since_injury |
| `journalHandler` | pre_journal_completion_rate, post_journal_completion_rate, avg_post_body_feel_7d |
| `writeSnapshot` (cross-cutting) | trends, schedule context, engagement metrics |

### Step 4: Periodic Enrichment Job

Some fields (chat engagement, drill stats, compliance, CV views, benchmark standing) are expensive to compute per-event. Run a lightweight enrichment cron every 15 min or on daily checkin:

```typescript
async function enrichSnapshotPeriodic(athleteId: string) {
  // Parallel queries for engagement metrics
  const [chatStats, drillStats, compliance, cvViews, benchmarks, recStats] = await Promise.all([
    getChatEngagement7d(athleteId),
    getDrillEngagement(athleteId),
    getComplianceRate(athleteId),
    getCVViews(athleteId),
    getBenchmarkStanding(athleteId),
    getRecActionRate(athleteId),
  ]);
  // Batch update snapshot
  await updateSnapshot(athleteId, { ...chatStats, ...drillStats, ... });
}
```

### Step 5: Update Visibility Matrix

| New Field Category | Athlete | Coach | Parent |
|-------------------|---------|-------|--------|
| Vitals detail | Full | spo2, temp, recovery | -- |
| Trends | Full | Full | wellness + sleep trends |
| Schedule context | Full | matches, sessions | exams |
| Injury detail | Full | Full | active_injury_count only |
| Engagement | Full | chat + compliance | checkin_consistency only |
| Academic | Full | -- | Full |
| CV/Recruiting | Full | Full | -- |
| Benchmark | Full | Full | -- |
| Wearable | Full | connected status | -- |

### Step 6: Update Context Builder

Add new snapshot fields to `PlayerContext.snapshotEnrichment` so AI agents have access to the full 360 view in their system prompts.

---

## Impact on Downstream Systems

| System | Impact |
|--------|--------|
| **AI Chat** | Richer context → more personalized coaching (trend-aware, engagement-aware) |
| **PDIL Protocols** | 51 new condition fields available for protocol rules |
| **Recommendation Engine** | Trend data enables predictive recs (e.g., "sleep declining 3 days → recovery rec before RED hits") |
| **Program Guardrails** | Sleep debt, body feel trend, compliance rate as guardrail conditions |
| **Coach Dashboard** | Full 360 view without additional API calls |
| **Parent Triangle** | Academic context, checkin consistency visible |
| **Boot Endpoint** | Fewer parallel queries needed — snapshot carries more data |
| **CMS Rule Builder** | 51 new fields auto-appear in dropdown |

---

## Cost: $0

All new fields are derived from existing data via:
- Simple COUNT/AVG/SUM queries on existing tables
- Rolling window computations (7d, 14d, 30d)
- Boolean checks on existing columns
- No AI calls required
