# Tomo — Unified Architecture Reference

> **Version**: 1.0 — April 9, 2026
> **Author**: Tareq El Kayyali + Claude
> **Purpose**: Single source of truth for Tomo's complete system architecture

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Athlete Data Fabric (5 Layers)](#2-athlete-data-fabric)
3. [Event Pipeline](#3-event-pipeline)
4. [Athlete Snapshot](#4-athlete-snapshot)
5. [Recommendation Intelligence Engine](#5-recommendation-intelligence-engine)
6. [Performance Director Intelligence Layer (PDIL)](#6-pdil)
7. [Program System](#7-program-system)
8. [Schedule Rule Engine](#8-schedule-rule-engine)
9. [AI Chat Architecture](#9-ai-chat-architecture)
10. [Notification System](#10-notification-system)
11. [RAG Knowledge System](#11-rag-knowledge-system)
12. [CMS Admin Panel](#12-cms-admin-panel)
13. [Mobile App Architecture](#13-mobile-app-architecture)
14. [Auth & Infrastructure](#14-auth--infrastructure)
15. [Integrations](#15-integrations)
16. [API Surface](#16-api-surface)
17. [Database Schema](#17-database-schema)
18. [Deployment Architecture](#18-deployment-architecture)
19. [Architecture Principles](#19-architecture-principles)
20. [System Metrics](#20-system-metrics)

---

## 1. System Overview

Tomo is an AI coaching platform for young athletes (ages 13-25) built on a **5-Layer Athlete Data Fabric**. Every piece of athlete data flows through an immutable event stream, gets pre-computed into a denormalized snapshot, triggers intelligent recommendations, and feeds multi-agent AI coaching — all governed by a Performance Director protocol layer that encodes domain expertise.

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Expo/RN)                      │
│  Plan Tab │ Chat Tab (AI Coach) │ Dashboard │ Modals/Stacks │
└─────────┬───────────────────────────────────────────────────┘
          │  REST API + Supabase Realtime
┌─────────▼───────────────────────────────────────────────────┐
│                  BACKEND (Next.js 16 / Railway)              │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Boot    │  │  Chat    │  │ Schedule │  │  Admin     │  │
│  │ Endpoint │  │ Agents   │  │  Engine  │  │  Panel     │  │
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
└──────────────────────────────────────────────────────────────┘
          │
   ┌──────▼──────┐
   │  External   │  WHOOP OAuth, Voyage AI (embeddings),
   │  Services   │  Anthropic Claude (AI), Firebase (push)
   └─────────────┘
```

**Tech Stack**:
- **Backend**: Next.js 16, TypeScript, Railway (auto-deploy)
- **Mobile**: Expo / React Native (iOS, Android, Web)
- **Database**: Supabase PostgreSQL with RLS, pgvector, Realtime
- **AI**: Claude Sonnet/Haiku (chat + programs), Voyage AI (RAG embeddings)
- **Push**: Firebase Cloud Messaging
- **Wearables**: WHOOP (production), Garmin/Oura/Fitbit (schema-ready)
- **Admin UI**: shadcn/ui + Next.js client components

---

## 2. Athlete Data Fabric

The Data Fabric is a 5-layer architecture where data flows downward (events → snapshot → recommendations → protocols) and every consumer reads from pre-computed layers, never raw tables.

```
Layer 1: Immutable Event Stream     (athlete_events — 28 types, append-only)
    ↓
Layer 2: Pre-computed Snapshot      (athlete_snapshots — 39 fields, O(1) reads)
    ↓
Layer 3: Assembled Context          (PlayerContext — 100+ fields, 17 parallel queries)
    ↓
Layer 4: Recommendation Engine      (athlete_recommendations — 9 types, event-triggered)
    ↓
Layer 5: PDIL Protocols             (pd_protocols — domain expertise, overrides AI)
```

**Key Invariant**: All UI components and AI agents read from Layer 2+ snapshots. No consumer queries raw tables directly.

---

## 3. Event Pipeline

### 3a. Event Types (28 total)

Every data point enters the system as an immutable event in `athlete_events`.

| Category | Event Type | Description |
|----------|-----------|-------------|
| **Biometric** | `VITAL_READING` | HRV, resting HR, SpO2, skin temp |
| | `WEARABLE_SYNC` | Bulk device sync (WHOOP, Oura, etc.) |
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
| | `PARENT_INPUT` | Academic load, schedule conflict, wellness concern |
| | `TRIANGLE_FLAG` | Multi-role alert (overload, conflict, concern) |
| **CV/Recruiting** | `COMPETITION_RESULT` | Match result, opponent, stats |
| | `CLUB_VIEW` | CV viewed by external |
| | `CV_EXPORTED` | CV shared (PDF/link/QR) |
| **Journal** | `JOURNAL_PRE_SESSION` | Pre-training target + focus |
| | `JOURNAL_POST_SESSION` | Post-training reflection + outcome |

### 3b. Event Structure

```typescript
interface AthleteEvent {
  event_id: string;          // UUID
  athlete_id: string;        // UUID
  event_type: EventType;     // One of 28 types
  occurred_at: string;       // ISO8601 — WHEN it happened
  source: 'WEARABLE' | 'MANUAL' | 'SYSTEM' | 'COACH' | 'PARENT';
  payload: EventPayload;     // Type-specific data
  created_by: string;        // Who triggered it
  created_at: string;        // Server log time
  correction_of: string | null; // Audit trail for corrections
}
```

### 3c. Processing Pipeline

```
emitEvent()                          — Validate + INSERT into athlete_events
    ↓
processEvent()                       — Route by event_type to handler
    ├── wellnessHandler              — Compute readiness, wellness trend
    ├── sessionHandler               — Compute load, ACWR, dual load
    ├── academicHandler              — Compute academic load
    ├── journalHandler               — Compute completeness, streak
    ├── assessmentHandler            — Store results, update benchmarks
    ├── vitalHandler                 — Update HRV baseline, resting HR
    ├── drillHandler                 — Update mastery scores
    ├── competitionHandler           — Update CV, mastery
    └── ... (others)
    ↓
writeSnapshot()                      — UPSERT to athlete_snapshots (Layer 2)
    ↓ (fire-and-forget, non-blocking)
    ├── triggerRecommendationComputation()   — Layer 4 RIE
    ├── triggerDeepProgramRefreshAsync()     — Layer 5 AI programs (if stale)
    ├── evaluatePDILForEvent()              — Protocol evaluation
    ├── processDataEvent()                  — Notification triggers
    └── triggerSnapshotNotifications()      — Alert checks
```

**Key files**:
- `backend/services/events/eventEmitter.ts` — Entry point
- `backend/services/events/eventProcessor.ts` — Router + handler dispatch
- `backend/services/events/snapshot/snapshotWriter.ts` — Atomic snapshot update
- `backend/services/events/handlers/` — Per-type handlers

---

## 4. Athlete Snapshot

### 4a. Fields (39 total)

The snapshot is a single denormalized row per athlete, updated after every event.

| Group | Fields | Count |
|-------|--------|-------|
| **Identity** | `athlete_id`, `snapshot_at`, `dob` | 3 |
| **Profile** | `sport`, `position`, `academic_year` | 3 |
| **Anthropometrics** | `height_cm`, `weight_kg`, `phv_stage`, `phv_offset_years` | 4 |
| **Readiness** | `readiness_score` (0-100), `readiness_rag` (GREEN/AMBER/RED), `hrv_baseline_ms`, `hrv_today_ms`, `resting_hr_bpm`, `sleep_quality` (0-10) | 6 |
| **Load** | `acwr`, `atl_7day`, `ctl_28day`, `dual_load_index`, `academic_load_7day`, `athletic_load_7day`, `injury_risk_flag` | 7 |
| **Performance/CV** | `sessions_total`, `training_age_weeks`, `streak_days`, `cv_completeness`, `coachability_index`, `mastery_scores` (JSON), `strength_benchmarks` (JSON), `speed_profile` (JSON) | 8 |
| **Wellness** | `wellness_7day_avg`, `wellness_trend`, `triangle_rag` | 3 |
| **Journal** | `journal_completeness_7d`, `journal_streak_days`, `target_achievement_rate_30d`, `last_journal_at`, `pending_pre_journal_count`, `pending_post_journal_count` | 6 |
| **Meta** | `last_event_id`, `last_session_at`, `last_checkin_at` | 3 |

### 4b. Role-Based Visibility Matrix

```
ATHLETE:  Full access (all 39 fields)

COACH:    Identity + readiness_score + readiness_rag + HRV + resting_hr
          + injury_risk_flag + ACWR + ATL + CTL + athletic_load
          + sessions_total + training_age + streak + mastery + benchmarks
          + speed_profile + coachability + cv_completeness
          + wellness_7day_avg + wellness_trend
          + last_session_at + last_checkin_at

PARENT:   athlete_id + snapshot_at
          + readiness_rag (traffic light ONLY, no raw HRV)
          + dual_load_index + academic_load + athletic_load
          + streak_days + wellness_7day_avg + wellness_trend
          + triangle_rag + last_checkin_at
```

### 4c. Read/Write Pattern

- **Read**: `readSnapshot(athleteId, role)` → O(1) filtered row
- **Write**: `writeSnapshot(athleteId, event)` → atomic UPSERT after every event
- **Realtime**: `useTriangleSnapshot()` hook subscribes via Supabase Realtime

**Key files**:
- `backend/services/events/snapshot/snapshotReader.ts`
- `backend/services/events/snapshot/snapshotWriter.ts`
- `backend/services/events/constants.ts` — Visibility matrix
- `backend/services/programs/snapshotFieldRegistry.ts` — Field registry (labels, types, units)

---

## 5. Recommendation Intelligence Engine

### 5a. 9 Recommendation Types

| Type | Triggers | Priority | Expiry | Visibility |
|------|----------|----------|--------|------------|
| `READINESS` | WELLNESS_CHECKIN, VITAL_READING, WEARABLE_SYNC, SLEEP_RECORD | P1-P2 | 24h | Athlete, Coach |
| `LOAD_WARNING` | SESSION_LOG, COMPETITION_RESULT | P2-P3 | 48h | Athlete, Coach |
| `RECOVERY` | WELLNESS_CHECKIN, SLEEP_RECORD | P2 | 12h | Athlete, Coach |
| `DEVELOPMENT` | ASSESSMENT_RESULT | P3 | 7d | Athlete, Coach |
| `ACADEMIC` | ACADEMIC_EVENT, STUDY_SESSION_LOG | P2-P3 | 72h | All |
| `CV_OPPORTUNITY` | ASSESSMENT_RESULT | P3-P4 | 14d | Athlete, Coach |
| `TRIANGLE_ALERT` | COACH_ASSESSMENT, PARENT_INPUT, TRIANGLE_FLAG | P1-P2 | 72h | All |
| `MOTIVATION` | SESSION_LOG, COMPETITION, MILESTONE, JOURNAL_POST | P4 | 48h | Athlete |
| `JOURNAL_NUDGE` | JOURNAL_PRE_SESSION, JOURNAL_POST_SESSION | P2 | 4h | Athlete |

### 5b. Event-to-Rec Routing

```typescript
EVENT_TO_REC_TYPES = {
  SESSION_LOG:         ['LOAD_WARNING', 'READINESS', 'RECOVERY', 'MOTIVATION'],
  WELLNESS_CHECKIN:    ['READINESS', 'RECOVERY'],
  ASSESSMENT_RESULT:   ['DEVELOPMENT', 'CV_OPPORTUNITY', 'MOTIVATION'],
  ACADEMIC_EVENT:      ['ACADEMIC'],
  STUDY_SESSION_LOG:   ['ACADEMIC'],
  COACH_ASSESSMENT:    ['TRIANGLE_ALERT'],
  PARENT_INPUT:        ['TRIANGLE_ALERT'],
  JOURNAL_PRE_SESSION: ['JOURNAL_NUDGE'],
  JOURNAL_POST_SESSION:['JOURNAL_NUDGE', 'MOTIVATION'],
}
```

### 5c. Recommendation Record

```typescript
interface Recommendation {
  rec_id: string;
  athlete_id: string;
  rec_type: RecType;
  priority: 1 | 2 | 3 | 4;       // 1=urgent, 4=informational
  status: 'PENDING' | 'DELIVERED' | 'ACTED' | 'DISMISSED' | 'EXPIRED' | 'SUPERSEDED';
  title: string;
  body_short: string;
  body_long: string | null;
  confidence_score: number;        // 0-1
  evidence_basis: Record<string, unknown>;
  retrieved_chunk_ids: string[];   // RAG chunks used
  visible_to_athlete: boolean;
  visible_to_coach: boolean;
  visible_to_parent: boolean;
  expires_at: string | null;
}
```

### 5d. Architecture

- **Dispatcher** (`recommendationDispatcher.ts`): Routes events to relevant computers
- **9 Computers** (`recommendations/computers/`): Independent modules, each generates 0-N recs
- **Superseding**: New recs replace PENDING recs of same type
- **Cost**: $0 — all rule-based, no AI calls

**Key files**: `backend/services/recommendations/`

---

## 6. PDIL

### Performance Director Intelligence Layer

The apex layer where domain expertise (coach/performance director knowledge) overrides AI autonomy. Protocols are immutable from the AI's perspective.

### 6a. 34 Condition Fields

| Category | Fields |
|----------|--------|
| **Snapshot** (10) | `acwr`, `atl_7day`, `ctl_28day`, `injury_risk_flag`, `phv_stage`, `dual_load_index`, `training_age_weeks`, `streak_length`, `cv_completeness`, `season_phase` |
| **Vitals** (8) | `readiness_score`, `readiness_rag`, `hrv_morning_ms`, `sleep_hours`, `sleep_quality`, `energy`, `soreness`, `mood`, `pain_flag` |
| **Calendar** (5) | `days_to_next_match`, `days_to_next_exam`, `has_match_today`, `sessions_today`, `days_since_last_session` |
| **Derived** (4) | `hrv_ratio`, `load_trend_7d`, `session_count_7day`, `sleep_debt_3d` |
| **Academic** (3) | `academic_stress`, `has_exam_today`, `study_load_7day` |
| **Other** (4) | `consecutive_red_days`, `wellness_7day_avg`, etc. |

### 6b. Protocol Categories

| Category | Authority Level | Example |
|----------|----------------|---------|
| `safety` | Highest | PHV restrictions, injury protection |
| `recovery` | High | Post-match recovery, high-load deload |
| `performance` | Medium | Competition prep, tactical focus |
| `development` | Medium | Skill growth prioritization |
| `academic` | Medium | School integration, exam periods |

### 6c. Output Domains

1. **Training Modifiers**: `load_multiplier`, `intensity_cap`, `contraindications`, `required_elements`, `session_cap_minutes`
2. **Recommendation Guardrails**: `blocked_categories`, `mandatory_categories`, `priority_override`
3. **RAG Overrides**: `forced_domains`, `blocked_domains`, `condition_tags`
4. **AI Coaching Context**: `system_injection` (prompt text), `safety_critical` (forces Sonnet)

### 6d. Conflict Resolution

When multiple protocols fire simultaneously:
- `load_multiplier` → **MIN** (most restrictive wins)
- `intensity_cap` → **Strictest level** wins
- `contraindications` / `blocked_categories` → **UNION** (all apply)
- `priority_override` → **Highest rank** (P0 > P1 > P2 > P3)
- `system_injection` → **Concatenated** in priority order

### 6e. Fail-Safes

- **Default** (no protocols fire): Full autonomy
- **Error** (evaluation fails): 85% load cap, moderate intensity, `safety_critical=true`

**Key files**: `backend/services/events/pdil/`

---

## 7. Program System

### 7a. Program Guardrails (8 Rules)

Applied to all program recommendations before delivery:

| Rule | Condition | Action |
|------|-----------|--------|
| **ACWR Gate** | ACWR > 1.5 (danger) | 50% load cap; > 1.3 → 75% |
| **Readiness Gate** | RED readiness | 50% load, block high-intensity; AMBER → 75% |
| **HRV Suppression** | today_hrv / baseline < 0.8 | 65-75% load cap |
| **Sleep Quality** | quality < 5/10 | 75% load cap |
| **Dual Load** | dual_load_index > 80 | 65% athletic volume cap |
| **Academic Load** | academic_load_7day > threshold | 75% training cap |
| **Injury Risk** | HIGH flag | 70% load, prioritize prevention |
| **Wellness Trend** | DECLINING + avg < threshold | 80% load cap |

Additional protections:
- **Training Age** (< 26 weeks): 70% load, block advanced categories
- **PHV Safety** (mid-PHV): 60% load, block barbell squats, depth jumps, Olympic lifts, max sprint, heavy deadlift
- **Mastery Boosting**: Weak pillars → elevate matching programs

### 7b. Deep Program Refresh (Layer 5)

- **Trigger events**: ASSESSMENT_RESULT, WELLNESS_CHECKIN, SESSION_LOG, INJURY_FLAG/CLEARED, PHV_MEASUREMENT, WEARABLE_SYNC, ACADEMIC_EVENT, STUDY_SESSION_LOG
- **Staleness**: 7 days before recompute
- **AI**: Claude selects 8-15 programs from catalog with priority ranking
- **Cache**: `athlete_snapshots.program_recommendations` (JSONB)
- **Cost**: ~$0.02-0.05 per refresh (Haiku)

### 7c. Program Recommendation Engine

1. Fetch player position, age band, PHV stage, anthropometrics
2. Filter programs by position emphasis
3. Get prescriptions for age band
4. Apply PHV safety checks
5. Apply anthropometric load modifiers
6. Priority bucket: mandatory → high → medium → injury prevention → technical
7. Apply guardrails (load caps, blocked categories)

**Key files**:
- `backend/services/programs/programGuardrails.ts`
- `backend/services/programs/deepProgramRefresh.ts`
- `backend/services/programs/programRecommendationEngine.ts`
- `backend/services/programs/snapshotFieldRegistry.ts`

---

## 8. Schedule Rule Engine

### 8a. Master Priority Order

| Priority | Category | Notes |
|----------|----------|-------|
| P1 | School | Non-negotiable, locked hours |
| P1 | Exam | Non-negotiable, locked time |
| P2 | Match | Game day |
| P3 | Recovery | Post-match / high-load |
| P4 | Club / Academy | Team training |
| P5 | Gym | Individual training |
| P6 | Study | Academic sessions |
| P7 | Personal Dev | Film study, tactical review |

### 8b. Master Buffers

| Buffer | Duration | Purpose |
|--------|----------|---------|
| Default | 30 min | Between any two events |
| After high intensity (RPE >= 7) | 45 min | Recovery gap |
| After match | 60 min | Post-match recovery |
| Before match | 120 min | No hard training within 2h of kickoff |

### 8c. Master Intensity Caps

- Max 3 HARD sessions per 7-day cycle
- Max 2 sessions per day (absolute cap)
- No HARD training day before match
- No HARD on exam day
- Recovery day mandatory after match

### 8d. Scenario Modifiers (4 Phases)

| Scenario | Hard/Week | Gym Days | Study Mult | Special |
|----------|-----------|----------|------------|---------|
| `normal` | 3 | No limit | 1.0x | Full capacity |
| `league_active` | 2 | Max 3 | 1.0x | Recovery after match, match days Fri/Sat |
| `exam_period` | 2 | Reduced | 1.5x | Light on exam days, drop personal dev |
| `league_and_exam` | 1 | Max 2 | 1.5x | All restrictions combined |

### 8e. Player Preferences

Stored in `player_schedule_preferences` table (user_id PK):
- School days/times, sleep window, day bounds
- Study days/start/duration, gym days/start/duration
- Club days/start, personal dev days/start
- Buffer overrides, scenario flags
- Exam schedule (JSONB), study subjects
- Training categories (JSONB)

### 8f. Key Functions

- `detectScenario(prefs)` → scenario ID
- `getEffectiveRules(prefs)` → merged master + scenario + player rules
- `buildRuleContext(prefs)` → AI system prompt text
- `buildExamStudyBlocks(...)` → study event proposals

**Key file**: `backend/services/scheduling/scheduleRuleEngine.ts`

---

## 9. AI Chat Architecture

### 9a. 3-Layer Intent Classification

```
Layer 1: Exact Match     (<1ms, $0)     — Chip actions, common phrases
    ↓ (no match)
Layer 2: Haiku AI        (~200ms, $0.0001) — Context-aware classifier
    ↓ (fallthrough)
Layer 3: Full Orchestrator               — Multi-agent tool loop
```

### 9b. 4 Specialized Agents

| Agent | Tools | Domain |
|-------|-------|--------|
| **Timeline** | 6 | Calendar CRUD, auto-fill, schedule |
| **Output** | 8 | Readiness, vitals, benchmarks, drills, programs |
| **Mastery** | 6 | Achievements, trajectories, CV, consistency, career |
| **Settings** | 4 | Profile, schedule preferences |

### 9c. Context Builder (PlayerContext)

Assembled from 17 parallel queries at boot:

1. User profile (name, sport, position, age)
2. Athlete snapshot (Layer 2)
3. Today's calendar events
4. Latest checkin
5. Top 6 recommendations (Layer 4)
6. Benchmark profile (percentiles, gaps, strengths)
7. Upcoming exams (14 days)
8. Notification unread count
9. Tomorrow's first event
10. Recently started events
11. Schedule preferences
12. WHOOP sleep data
13. Recent vitals (7d)
14. Yesterday vitals (delta comparison)
15. Active programs
16. Cached AI program recommendations
17. Coach-assigned programmes

### 9d. System Prompt Assembly

```
Static block (cached)
  + Sport-position context (football/padel/athletics/basketball/tennis rules)
  + Age-band tone (U13/U15/U17/U19+ communication profiles)
  + Agent-specific prompt (tools + instructions)
  + Temporal context (time of day, match day, exam proximity)
  + Schedule rules (buildRuleContext output)
  + Active recommendations (top recs from Layer 4)
  + PDIL injection (training modifiers, coaching context)
  + Conversation state (persisted session context)
```

### 9e. Orchestrator Loop

1. Intent classification (3-layer)
2. Context building (snapshot + recs + schedule)
3. Route to agent(s)
4. Tool loop (max 5 iterations): Claude calls tools → executor handles → results returned
5. Response formatting (text + action chips + capsules)

### 9f. Write Action Gate

All create/update/delete operations follow:
```
AI proposes action → PendingWriteAction → ConfirmationCard → User confirms → Execution
```

### 9g. Cost Architecture

| Operation | Model | Cost |
|-----------|-------|------|
| Exact match (capsule) | None | $0 |
| Haiku classifier | Haiku | ~$0.0001 |
| Full orchestrator | Sonnet | ~$0.02-0.08 |
| Safety-critical (PDIL) | Sonnet (forced) | ~$0.03-0.10 |
| Informational queries | Haiku | ~$0.001-0.005 |
| Recommendations/training | Sonnet | ~$0.02-0.08 |

**Key files**:
- `backend/services/agents/orchestrator.ts`
- `backend/services/agents/intentClassifier.ts`
- `backend/services/agents/intentRegistry.ts`
- `backend/services/agents/contextBuilder.ts`
- `backend/services/agents/outputAgent.ts`
- `backend/services/agents/timelineAgent.ts`
- `backend/services/agents/masteryAgent.ts`
- `backend/services/agents/chatGuardrails.ts`
- `backend/lib/trackedClaudeCall.ts` — Cost telemetry

---

## 10. Notification System

### 10a. Architecture

- **22 notification types** across 7 categories
- **Engine** (`notificationEngine.ts`): Core generation logic
- **Triggers** (`notificationTriggers.ts`): Event-driven (from event processor)
- **Scheduled Triggers** (`scheduledTriggers.ts`): Time-based (morning brief, reminders)
- **Push Delivery** (`pushDelivery.ts`): Firebase Cloud Messaging
- **Templates** (`notificationTemplates.ts`): Message formatting

### 10b. Categories

All, Critical, Training, Coaching, Academic, Triangle, CV

### 10c. Tables

- `athlete_notifications` — Notification records
- `athlete_notification_preferences` — Per-type toggle
- `player_push_tokens` — Device registration
- `notification_dismissal_log` — Audit trail

### 10d. UI

- Bell icon with combined unread count (legacy + center)
- Pulse animation for critical notifications
- Badge caps at 99+
- P1/P2 expanded by default
- Swipe dismiss/read
- "Ask Tomo" secondary CTA on each notification

**Key files**: `backend/services/notifications/` (8 files)

---

## 11. RAG Knowledge System

### 11a. Architecture

- **Embeddings**: Voyage AI (512-dim), fallback to Gemini
- **Storage**: `rag_knowledge_chunks` table with pgvector column
- **Retrieval**: Semantic similarity search (top K=5)

### 11b. Knowledge Chunks

```typescript
interface KnowledgeChunk {
  chunk_id: string;
  domain: string;           // PHV_SAFETY, READINESS, LOAD_MANAGEMENT, etc.
  title: string;
  content: string;
  athlete_summary: string;  // Youth-friendly explanation
  coach_summary: string;    // Technical explanation
  primary_source: string;   // Research paper/guideline
  evidence_grade: string;   // A (RCT), B (Cohort), C (Expert)
  vector: pgvector;         // 512-dim embedding
}
```

### 11c. Phases

1. **Phase 1**: 24 sports science knowledge chunks
2. **Phase 2**: 8 position-specific chunks (football/padel/athletics/basketball/tennis)
3. **Phase 3**: Cross-session athlete memory (`athlete_longitudinal_memory` table, Haiku extraction)

### 11d. PDIL Integration

RAG retrieval respects PDIL overrides:
- `forced_domains` — Must include chunks from these domains
- `blocked_domains` — Exclude chunks from these domains
- Graceful degradation — if RAG fails, baseline behavior preserved

---

## 12. CMS Admin Panel

### 12a. Tech Stack

- **Framework**: Next.js 16 client components
- **UI Library**: shadcn/ui (Button, Card, Input, Select, Table, etc.)
- **Auth**: `requireAdmin()` middleware
- **Data**: `supabaseAdmin()` service role client (bypasses RLS)

### 12b. Admin Sections (44 pages)

| Section | Pages | Purpose |
|---------|-------|---------|
| **Sports Config** | sports, attributes, positions, skills, rating-levels | Sport-specific content |
| **Content** | content items, pages | CMS content CRUD |
| **Design System** | brand, global, mastery, timeline, chat, output, own-it, flags, component-styles | UI config |
| **Coaching** | drills, programs, programmes, protocols (+audit, +test) | Training content |
| **Rules & Signals** | program-rules, signals, pd-signals | Guardrail config |
| **Intelligence** | intelligence, performance-intelligence, recommendation-engine, proactive-dashboard | AI tuning |
| **Notifications** | management, push, scheduled, templates | Notification config |
| **Data** | normative-data, assessments, cv, dna-card, theme | Reference data |
| **Feature Flags** | feature-flags | A/B testing |
| **Page Config** | page-configs | Layout management |

### 12c. CMS-Managed Configuration Patterns

| Pattern | Table | Example |
|---------|-------|---------|
| **Key-Value Store** | `ui_config` | DNA card tiers, brand tokens |
| **Sport-Level Config** | `sports.config` (JSONB) | Per-sport settings |
| **Flexible Content** | `content_items` | Quotes, onboarding, milestones |
| **Mastery Pillars** | API endpoint | Pillar name, emoji, color, metrics+weights |
| **App Themes** | `app_themes` | Dark/light colors, typography |
| **Feature Flags** | `feature_flags` | Flag key, enabled, sport filter |
| **Page Configs** | `page_configs` | Screen layout, sections, color overrides |

### 12d. Content Delivery Flow

```
Admin Panel UI → POST/PUT with admin auth
    ↓
API Route (requireAdmin check) → Zod validation
    ↓
Admin Service → supabaseAdmin() (bypasses RLS)
    ↓
Database (content tables)
    ↓
Public API (no auth): /api/v1/content/manifest, /bundle, /items, /ui-config
    ↓
Mobile App → ContentProvider → AsyncStorage cache
```

**Key files**:
- `backend/app/admin/` — Admin pages
- `backend/services/admin/` — 18 service files
- `backend/lib/validation/` — Zod schemas
- `backend/app/api/v1/content/` — Public content APIs

---

## 13. Mobile App Architecture

### 13a. Provider Stack (inside-out)

```
ErrorBoundary
  GestureHandlerRootView
    ConfigProvider          (UI config: theme, pages, flags)
      ThemeProvider          (Design System tokens)
        ContentProvider      (CMS bundle: sports, attributes, skills)
          AuthProvider       (Supabase session + profile)
            BootProvider     (Pre-fetched athlete snapshot)
              SportProvider  (Active sport + config)
                SubTabProvider
                  NotificationsProvider
                    RootNavigator
```

### 13b. Navigation

```
RootNavigator
  ├── AuthNavigator          (login / signup)
  ├── OnboardingScreen       (role-specific setup)
  └── Role-based:
      ├── MainNavigator      (player — 3 tabs)
      │   ├── Plan Tab       → TrainingScreen (calendar/timeline)
      │   ├── Chat Tab       → HomeScreen (AI coach, center-raised)
      │   └── Dashboard Tab  → SignalDashboardScreen (readiness, ACWR)
      │   └── Stack screens  (profile, settings, details, modals)
      ├── CoachNavigator     (coach — 3 tabs)
      └── ParentNavigator    (parent — 3 tabs)
```

### 13c. Key Hooks (46 total)

| Category | Notable Hooks |
|----------|--------------|
| **State** | `useAuth`, `useSportContext`, `useContentProvider`, `useBootData`, `useTheme`, `useConfigProvider` |
| **Data Fetching** | `useTriangleSnapshot` (realtime), `useAthleteSnapshot`, `useOutputData`, `useOwnItData`, `useCalendarData` |
| **Features** | `useCheckinStatus`, `useHealthKit`, `useNotifications`, `useVoiceInput`, `useFavorites`, `useMasteryData`, `useScheduleRules` |
| **UI/Animation** | `useFadeIn`, `useMomentum`, `useBreathing`, `usePadelAnimations` |

### 13d. Services (39 files)

| Category | Files |
|----------|-------|
| **Auth & API** | `auth.ts`, `supabase.ts`, `api.ts`, `apiConfig.ts` |
| **Content** | `contentService.ts`, `contentCache.ts`, `configService.ts`, `configCache.ts` |
| **Planning** | `studyPlanGenerator.ts`, `trainingPlanGenerator.ts`, `schedulingEngine.ts` |
| **Calculations** | `footballCalculations.ts`, `padelCalculations.ts`, `readinessScore.ts`, `derivedMetricCalculators.ts` |
| **Sensors** | `healthKit.ts`, `jumpDetection.ts`, `sprintTimer.ts`, `poseEstimation.ts` |

### 13e. Chat Components (45 files)

- **Main**: `ProactiveDashboard.tsx`, `ResponseRenderer.tsx`, `VoicePulse.tsx`
- **30+ Capsule Components** (`/capsules/`): CheckinCapsule, TestLogCapsule, EventEditCapsule, StudyScheduleCapsule, TrainingScheduleCapsule, ProgramInteractCapsule, PHVCalculatorCapsule, etc.
- **Cards**: DailyBriefingCard, GoalCard, InjuryCard

### 13f. Cross-Screen Data Freshness

`refreshBus.ts` — lightweight event emitter:
```typescript
emitRefresh('metrics');    // Chat logs test → Output screen refetches
emitRefresh('calendar');   // Chat creates event → Plan screen refetches
emitRefresh('*');          // Broadcast to all listeners
```

### 13g. State Management

**Pattern**: React Context + Hooks (no Redux/Zustand)
- 7 Context Providers (auth, content, config, sport, theme, boot, subtab)
- **Cache-then-fetch**: Load from AsyncStorage instantly, fetch fresh in background
- Explicit data flow, no middleware complexity

---

## 14. Auth & Infrastructure

### 14a. Auth Flow (Two-Tier)

```
Request arrives at proxy.ts
  ├── Check Authorization: Bearer <token>   (mobile — Supabase JWT)
  │   └── Validate via Supabase auth
  ├── Fallback: Cookie-based auth           (web — Supabase SSR)
  │   └── Validate via Supabase SSR client
  └── Public routes bypass auth:
      content/*, config/*, cv share links, webhooks, cron endpoints
```

**Custom headers set**: `x-user-id`, `x-user-email` for downstream routes

### 14b. Supabase Clients

| Client | Use | RLS |
|--------|-----|-----|
| `supabaseAdmin()` | Backend API routes, admin operations | **Bypasses** RLS (service role) |
| `supabaseClient()` | Browser-side, web admin panel | Respects RLS |
| `supabaseServer()` | SSR routes, cookie-based auth | Respects RLS |

### 14c. AI Telemetry

`trackedClaudeCall()` wraps every Anthropic API call:
- **Tracks**: input/output tokens, cache read/write, cost USD, latency ms
- **Storage**: `api_usage_log` table (fire-and-forget)
- **Logging**: Console `[API-COST]` tag
- **Models**: Sonnet ($3/$15 in/out), Haiku ($0.80/$4)
- **Streaming**: `trackedClaudeCallStreaming()` for chat responses

---

## 15. Integrations

### 15a. WHOOP (Production)

**OAuth 2.0 Flow**:
1. `/api/v1/integrations/whoop/authorize` → Generate state token, redirect to WHOOP
2. WHOOP callback → Exchange code for tokens, store in `wearable_connections`
3. `/api/v1/integrations/whoop/sync` → Pull data (30d first sync, 7d subsequent)

**Data Mapped**:
| WHOOP Data | Tomo Event | Fields |
|------------|-----------|--------|
| Recovery | `VITAL_READING` | HRV, resting HR, SpO2, skin temp, recovery score |
| Sleep | `SLEEP_RECORD` | Duration, quality, stages, efficiency, respiratory rate |
| Workouts | `SESSION_LOG` | Strain, HR zones, distance, calories |
| Cycles | `WEARABLE_SYNC` | Daily summaries |

**Token Refresh**: Auto-refresh with 5-min buffer; marks `auth_required` if refresh fails

### 15b. Schema-Ready Integrations

- Garmin, Oura, Fitbit — `wearable_connections` table supports multiple providers
- Integration status endpoint: `/api/v1/integrations/whoop/status`

---

## 16. API Surface

### 16a. Route Summary (231 handlers)

| Group | Routes | Auth | Purpose |
|-------|--------|------|---------|
| **Boot** | 1 | Auth | Pre-load state (17 parallel queries) |
| **Chat** | 8 | Auth | Messages, stream, agent, sessions, briefing |
| **Calendar** | 7 | Auth | Events CRUD, auto-fill, day-lock, ghost suggestions |
| **Schedule** | 2 | Auth | Rules GET/PATCH, validate |
| **Events** | 8 | Auth | Ingest, process, bridge, aggregations |
| **Health** | 3 | Auth | Vitals, checkin, sleep sync |
| **Journal** | 2 | Auth | Pre-session, post-session |
| **Programs** | 3 | Auth | Refresh, drill recommend, drill search |
| **Assessments** | 2 | Auth | Benchmark metric, onboarding |
| **Recommendations** | 2 | Auth | Query, refresh |
| **Notifications** | 15 | Auth | Settings, templates, triggers, push, read/dismiss |
| **Coach** | 10 | Auth (coach) | Players, assessments, notes, programmes |
| **Parent** | 7 | Auth (parent) | Children, study profile, exam, study blocks |
| **Integrations** | 5 | Mixed | WHOOP OAuth, sync, status |
| **Content** | 5 | Public | Manifest, bundle, items, ui-config, rec-config |
| **Admin** | 20+ | Admin | Sports, drills, protocols, themes, flags, etc. |
| **Output/Config** | 3 | Auth | Output snapshot, config manifests |
| **Snapshot** | 1 | Auth | Current snapshot (role-filtered) |
| **CV** | 3 | Mixed | Share, export, view |
| **Relationships** | 6 | Auth | Invite, link, accept |

---

## 17. Database Schema

### 17a. Tables (41 migrations, 30+ tables)

| Category | Tables |
|----------|--------|
| **User** | `users`, `checkins`, `plans`, `points_ledger`, `milestones` |
| **Data Fabric** | `athlete_events`, `athlete_snapshots`, `athlete_daily_load`, `athlete_recommendations`, `athlete_longitudinal_memory` |
| **Calendar** | `calendar_events`, `calendar_load`, `player_schedule_preferences` |
| **Chat** | `chat_messages`, `chat_sessions` |
| **Health** | `health_data`, `wearable_connections`, `daily_vitals` |
| **Assessment** | `test_results`, `drills_result_data`, `training_drills` |
| **Journal** | `training_journals` |
| **RAG** | `rag_knowledge_chunks`, `rag_voyage_embedding` |
| **Notifications** | `athlete_notifications`, `athlete_notification_preferences`, `player_push_tokens`, `notification_dismissal_log` |
| **CMS Content** | `sports`, `sport_attributes`, `sport_skills`, `sport_positions`, `sport_rating_levels`, `sport_test_definitions`, `sport_normative_data`, `content_items` |
| **Config** | `app_themes`, `feature_flags`, `page_configs`, `ui_config` |
| **Programs** | `football_training_programs`, `position_training_matrix` |
| **Protocols** | `pd_protocols`, `pd_protocol_audit` |

### 17b. RLS Policy

- All athlete-facing tables: `auth.uid() = user_id`
- Coach tables: linked athlete access via `relationships`
- Parent tables: linked child access via `relationships`
- CMS/content tables: public SELECT, admin-only write
- Admin operations: `supabaseAdmin()` with service role key

---

## 18. Deployment Architecture

### 18a. Infrastructure

```
GitHub (main branch)
    ↓ (auto-deploy on push)
Railway
    ├── Next.js 16 API       → /api/*, /admin/*
    ├── Expo Web Export       → /webapp/* (SPA fallback)
    └── Port 8080

Custom Domain: app.my-tomo.com → CNAME → 5qakhaec.up.railway.app
```

### 18b. Frontend Serving

- Expo web export lives in `backend/public/webapp/`
- Next.js rewrites serve it for non-API routes
- SPA catch-all to `/webapp/index.html`
- Same-origin API: mobile web uses `window.location.origin` (no CORS)

### 18c. Deploy Commands

```bash
# Frontend rebuild
cd backend && ./scripts/deploy-frontend.sh

# Deploy (auto via Railway)
git push origin main

# Local dev
cd backend && ./scripts/switch-env.sh prod && npm run dev
```

### 18d. Environment Variables (Railway)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GEMINI_API_KEY`
- `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`

---

## 19. Architecture Principles

### 1. Event Sourcing + CQRS
Write immutable events to Layer 1. Read from denormalized snapshot (Layer 2). Correct via `correction_of` audit chain, never overwrite.

### 2. Snapshot Denormalization
Pre-computed, role-filtered, O(1) reads. Updated atomically after every event. Single source of truth for all downstream consumers.

### 3. Fire-and-Forget Async
Recommendation computation, PDIL evaluation, program refresh, notifications — all non-blocking. Failures logged but never cascade.

### 4. PDIL Authority
Domain expertise (protocols) is immutable from AI perspective. AI agents read PDContext at startup, cannot override. Safety-critical forces Sonnet model.

### 5. Role-Based Access
Visibility matrices on snapshot, recommendations, and calendar. Three roles: Athlete (full), Coach (performance-focused), Parent (traffic-light view).

### 6. Deterministic Guardrails
8 hardcoded guardrail rules + CMS Rule Builder. No AI involved in safety decisions. Conflict resolution via MIN/UNION/strictest.

### 7. Boot Endpoint as API Contract
17 parallel queries pre-load all app state. Graceful partial failures. Response is authoritative — no follow-up queries needed.

### 8. CMS-First Configuration
Sports, attributes, skills, positions, tests, normative data, themes, flags, page configs — all DB-driven via admin panel. No code deploys for content changes.

### 9. Cost Optimization
Exact match ($0) → Haiku classifier ($0.0001) → Full agent ($0.02-0.08). Recommendations are rule-based ($0). Program refresh gated by staleness (7d cache). `trackedClaudeCall()` wraps all AI for telemetry.

### 10. Build for Scale
No hardcoded shortcuts. No adapter/translation layers. Proper DB tables with indexes and RLS from day one. One schema, one truth.

---

## 20. System Metrics

| Dimension | Value |
|-----------|-------|
| Event Types | 28 |
| Snapshot Fields | 39 |
| Recommendation Types | 9 |
| AI Agents | 4 (timeline, output, mastery, settings) |
| Agent Tools | 24 total (6+8+6+4) |
| PDIL Condition Fields | 34 |
| Program Guardrails | 8 hardcoded + custom |
| Schedule Priorities | 7 levels |
| Scenario Modifiers | 4 phases |
| Boot Parallel Queries | 17 |
| Visibility Roles | 3 (athlete, coach, parent) |
| Notification Types | 22 across 7 categories |
| CMS Admin Pages | 44 |
| API Route Handlers | 231 |
| Database Tables | 30+ |
| Migrations | 41 |
| Mobile Hooks | 46 |
| Mobile Services | 39 |
| Chat Capsule Components | 30+ |
| RAG Knowledge Chunks | 32 (24 general + 8 position-specific) |
| Supported Sports | 5 (football, soccer, basketball, tennis, padel) |
