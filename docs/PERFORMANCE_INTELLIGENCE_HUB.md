# Performance Intelligence Hub — Sports Director CMS AI Architecture

## Overview

The Performance Intelligence Hub is a CMS admin page at `/admin/performance-intelligence/` that gives Sports Performance Directors full control over how the AI Chat system makes decisions about athlete training, load management, benchmark gaps, and growth safety.

All configuration is stored in the `ui_config` table (4 keys, zero migrations). Every backend consumer falls back to hardcoded defaults if the DB is unavailable — zero-downtime guarantee.

---

## Architecture: 5-Layer Decision Flow

```
┌─────────────────────────────────────────────────────────────┐
│              ATHLETE MESSAGE ENTERS CHAT                     │
│           "Should I train heavy legs today?"                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          LAYER 1 — INTENT CLASSIFICATION                     │
│                                                              │
│  Exact Match ($0)  →  Haiku Classifier (~$0.0001)           │
│       ↓ no match          ↓ low confidence                  │
│                    Sonnet Orchestrator (~$0.003-0.01)        │
│                                                              │
│  40+ intent definitions route to 3 agents:                   │
│  Output (readiness/load/benchmarks)                          │
│  Timeline (calendar/schedule)                                │
│  Mastery (progress/CV)                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          LAYER 2 — ATHLETE SNAPSHOT                          │
│          readSnapshot() — O(1) single read                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ LOAD STATE   │  │ READINESS    │  │ PHV / MATURATION  │  │
│  │ ACWR: 1.35   │  │ Score: 42    │  │ Stage: mid_phv    │  │
│  │ ATL: 52      │  │ RAG: AMBER   │  │ Offset: -0.5yr    │  │
│  │ CTL: 38      │  │ HRV: 38ms   │  │ Mult: 0.60        │  │
│  │ DualLoad: 68 │  │ Sleep: 5/10  │  │                   │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ BENCHMARKS   │  │ WELLNESS     │  │ INJURY & RISK     │  │
│  │ Gaps: endur. │  │ 7d avg: 6.8  │  │ Risk: AMBER       │  │
│  │ Str: power   │  │ Trend: STABLE│  │ Age: 24 weeks     │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          LAYER 3 — DETERMINISTIC GUARDRAILS (8 Rules)        │
│          Always enforced BEFORE AI generates response         │
│                                                              │
│  ACWR Gate        >1.5 → 50% cap | >1.3 → 75% cap          │
│  Readiness Gate   RED → 50% cap, block explosive             │
│  PHV Safety Gate  Mid-PHV → 60% mult, NO heavy barbell   ◀──── CMS
│  HRV Suppression  <0.7 baseline → 60% cap                   │
│  Dual Load Gate   Index >75 → cap athletic at 75%            │
│  Injury Risk      HIGH → 60% cap, prevention priority        │
│  Wellness Decline  Declining + avg<5 → 70% cap               │
│  Training Age     <12 weeks → beginner protection 70%        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          LAYER 4 — AI RESPONSE GENERATION                    │
│                                                              │
│  System Prompt Assembly:                                     │
│  ┌────────────────────┬──────────────────────────────────┐  │
│  │ STATIC (cached)    │ DYNAMIC (per-request)         ◀──── CMS
│  │ Base persona       │ Sport-position context        ◀──── CMS
│  │ Response format    │ Age-band tone (U13-U19+)         │  │
│  │ Tool definitions   │ PHV safety block              ◀──── CMS
│  │                    │ Active recommendations            │  │
│  │                    │ Benchmark gaps + strengths         │  │
│  │                    │ Schedule rules + exams             │  │
│  │                    │ ACWR + readiness context           │  │
│  │                    │ Conversation history (12K)         │  │
│  └────────────────────┴──────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          LAYER 5 — POST-RESPONSE PHV SAFETY FILTER           │
│          enforcePHVSafety() in chatGuardrails.ts          ◀──── CMS
│                                                              │
│  IF mid-PHV athlete:                                         │
│    Scan for contraindicated terms                         ◀──── CMS
│    Append safety warning + safe alternatives              ◀──── CMS
│    Education-not-censorship approach                         │
│    "No Dead Ends" — always actionable guidance               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    RESPONSE TO ATHLETE                        │
│                                                              │
│  "Not today for heavy legs. Your load ratio is elevated      │
│   (1.35) and you're in a key growth phase. Instead, try      │
│   bodyweight squats and agility ladders."                     │
│                                                              │
│  [Schedule Light Session]  [Log Check-in]  [View My Load]    │
└─────────────────────────────────────────────────────────────┘
```

**◀── CMS** = Configurable by Sports Director via the Performance Intelligence Hub

---

## CMS Page: 5 Tabs

### Tab 1: Flow Overview
Interactive visual diagram of the 5-layer decision flow. Each layer is a clickable card showing live config status (e.g., "5 sports configured", "9 contraindications", "6 readiness rules"). Clicking navigates to the relevant editor tab.

### Tab 2: Sport Coaching Context
**Config key:** `sport_coaching_context`

| Field | Description | Example |
|-------|-------------|---------|
| Key Performance Metrics | Sport-specific metrics injected into AI prompt | Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test |
| Load Framework | How training load is modeled | ACWR 7:28 rolling, match = 1.0 AU reference |
| Position Notes | Per-position coaching context | Midfielder: Highest total distance. Prioritize aerobic base. |

**Consumed by:** `orchestrator.ts → buildSportContextSegment()`

**Sports supported:** Football, Padel, Athletics, Basketball, Tennis (extensible via CMS)

### Tab 3: PHV Safety Configuration
**Config key:** `phv_safety_config`

#### Stage Definitions

| Stage | Offset Range | Loading Multiplier | Key Priorities |
|-------|-------------|-------------------|----------------|
| Pre-PHV | < -1.0 | 0.70 | Coordination, FMS, speed (neural window) |
| Mid-PHV | -1.0 to +1.0 | 0.60 | Flexibility, core, reduced plyometrics |
| Post-PHV | > +1.0 | 0.85 | Gradual strength reintroduction, hypertrophy |
| Adult (18+) | N/A | 1.00 | Standard periodized training |

#### Exercise Contraindications (9 default entries)

| Blocked | Alternative | Citation |
|---------|------------|----------|
| Barbell back squat | Goblet squat (BW or light KB, 3x10) | Lloyd & Oliver, JSCR 2012 |
| Depth jumps | Low box step-downs (20-30cm, 3x8) | Myer et al., BJSM 2011 |
| Drop jumps | Pogo hops (low amplitude, 3x10) | Myer et al., BJSM 2011 |
| Olympic lifts | DB hang pull (light, 3x8) or KB swing | Faigenbaum & Myer, JSCR 2010 |
| Clean & jerk / Snatch | Medicine ball throws | Faigenbaum & Myer, JSCR 2010 |
| Maximal sprinting | Submaximal sprints (85%, 3x30m) | Read et al., Sports Med 2016 |
| Heavy deadlifts | Romanian DL (light DB, 3x10) | Lloyd & Oliver, JSCR 2012 |
| Loaded plyometrics | BW plyometrics (box jumps <30cm) | Myer et al., BJSM 2011 |
| High box jumps | Low box jumps (20-30cm max) | Myer et al., BJSM 2011 |

#### Monitoring Alerts

| Condition | Action |
|-----------|--------|
| Osgood-Schlatter disease | Stop jumping/kneeling. Refer to sports physio. Ice after activity. |
| Sever's disease | Reduce running volume. Heel cups. Avoid barefoot on hard surfaces. |

**Consumed by:** `phvCalculator.ts`, `chatGuardrails.ts → enforcePHVSafety()`, `orchestrator.ts → buildPHVSystemPromptBlock()`

### Tab 4: Readiness Decision Matrix
**Config key:** `readiness_decision_matrix`

First-match-wins rule evaluation (top-to-bottom):

| # | Condition | Priority | Title (has training) | Title (no training) |
|---|-----------|----------|---------------------|---------------------|
| 1 | RED + mid_phv | P1 | Rest Day — Growth Phase | Recovery Day — Growth Phase |
| 2 | RED | P1 | Rest Day Recommended | Good Day to Rest |
| 3 | AMBER + ACWR>1.3 | P1 | High Load + Low Readiness | Rest Day Helping You Recover |
| 4 | AMBER | P2 | Light Session Suggested | Moderate Day — Stay Active |
| 5 | GREEN + mid_phv | P2 | Ready but Modified | Ready — Modified Rest Day |
| 6 | GREEN | P3 | Ready for High Intensity | Ready — Rest Day Well Spent |

**Confidence Thresholds:**
- Fresh check-in (<12h): 0.9
- Wearable only (>12h): 0.7
- Stale / no data: 0.5

**Consumed by:** `readinessComputer.ts`

### Tab 5: AI Prompt Context Blocks
**Config key:** `ai_prompt_templates`

| Block | Enabled | ~Tokens | Description |
|-------|---------|---------|-------------|
| Sport & Position Context | Yes | 60-120 | Sport metrics, load framework, position notes |
| PHV Safety Block | Yes | 100-200 | Contraindications + alternatives (mid-PHV only) |
| Behavioral Profile | Yes | 30-50 | Archetype, compliance, recovery response |
| Triangle Intelligence | Yes | 40-60 | Readiness/wellness/load current state |
| Active Recommendations | Yes | 50-100 | Top P1-P2 recs from last 24h |
| Dual Load Adaptation | Yes | 20-40 | Academic-athletic balance, exam proximity |

Each block uses `{{variable}}` placeholders filled at runtime. Preview panel shows the assembled prompt with sample athlete data.

**Consumed by:** `orchestrator.ts` (system prompt assembly)

---

## Technical Architecture

### Data Storage
All configuration stored in the existing `ui_config` table — no new migrations required.

| Config Key | Description |
|-----------|-------------|
| `sport_coaching_context` | Per-sport metrics, load frameworks, position notes |
| `phv_safety_config` | Stage definitions, contraindications, monitoring alerts |
| `readiness_decision_matrix` | Decision rules, confidence thresholds |
| `ai_prompt_templates` | System prompt block templates |

### Caching
- 5-minute in-memory cache per config key (same pattern as `recommendationConfig.ts`)
- Explicit cache clear on CMS save
- Falls back to hardcoded defaults if DB unavailable

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/performance-intelligence/sport-context` | Read sport coaching config |
| POST | `/api/v1/admin/performance-intelligence/sport-context` | Save sport coaching config |
| GET | `/api/v1/admin/performance-intelligence/phv-config` | Read PHV safety config |
| POST | `/api/v1/admin/performance-intelligence/phv-config` | Save PHV safety config |
| GET | `/api/v1/admin/performance-intelligence/readiness-matrix` | Read readiness matrix |
| POST | `/api/v1/admin/performance-intelligence/readiness-matrix` | Save readiness matrix |
| GET | `/api/v1/admin/performance-intelligence/prompt-templates` | Read prompt templates |
| POST | `/api/v1/admin/performance-intelligence/prompt-templates` | Save prompt templates |
| GET | `/api/v1/admin/performance-intelligence/stats` | Flow overview statistics |

All endpoints require admin authentication via `requireAdmin()`.

### File Map

```
backend/
├── lib/validation/
│   └── performanceIntelligenceSchemas.ts     # 4 Zod schemas + types
├── services/admin/
│   └── performanceIntelligenceService.ts     # CRUD, cache, defaults
├── app/api/v1/admin/performance-intelligence/
│   ├── sport-context/route.ts                # GET + POST
│   ├── phv-config/route.ts                   # GET + POST
│   ├── readiness-matrix/route.ts             # GET + POST
│   ├── prompt-templates/route.ts             # GET + POST
│   └── stats/route.ts                        # GET only
├── components/admin/performance-intelligence/
│   ├── FlowOverview.tsx                      # Interactive diagram
│   ├── SportContextEditor.tsx                # Sport/position editor
│   ├── PHVConfigEditor.tsx                   # Stage/contraindication editor
│   ├── ReadinessMatrixEditor.tsx             # Decision rule editor
│   └── PromptTemplateEditor.tsx              # Prompt block editor
└── app/admin/(dashboard)/
    └── performance-intelligence/page.tsx      # Main tabbed page
```

### Modified Backend Consumers

| File | Change | Fallback |
|------|--------|----------|
| `orchestrator.ts` | `buildSportContextSegment()` reads from DB | Hardcoded sportMap |
| `phvCalculator.ts` | `buildPHVResultFromConfig()` reads stages from DB | Hardcoded boundaries |
| `chatGuardrails.ts` | `enforcePHVSafety()` + `buildPHVSystemPromptBlock()` read from DB | Hardcoded PHV_SAFE_ALTERNATIVES |
| `readinessComputer.ts` | Config loaded into cache for future use | Hardcoded if/else chain |

---

## Background: Event-Driven Data Pipeline

The snapshot that feeds all AI decisions is kept fresh by a continuous background pipeline:

```
Athlete Events                Event Processor              Snapshot Writer
├── Wellness check-in    →    wellnessHandler         →    Compute ACWR
├── Session log          →    sessionHandler          →    Update readiness RAG
├── Test result          →    assessmentHandler       →    Refresh wellness trend
└── Academic event       →    academicHandler         →    Recalc dual load index
                                    │                            │
                                    ▼                            ▼
                    Recommendation Dispatcher         Deep Refresh (on-demand)
                    (RIE — $0 cost)                   (Claude Haiku ~$0.008)
                    ├── Stale checkin → P1             ├── Full snapshot + context
                    ├── RED rag → P1 Recovery          ├── 4-6 diverse recs
                    ├── ACWR >1.5 → P1 Alert           ├── Program selection
                    └── Low benchmark → P2 Dev          └── Guardrails applied
                                    │                            │
                                    ▼                            ▼
                         ┌──────────────────────────────────────────┐
                         │  athlete_snapshots (Layer 2 cache)       │
                         │  ← Chat reads via readSnapshot()        │
                         └──────────────────────────────────────────┘
```

---

## Decision Matrix: Query Routing & Cost

| Athlete Question | Key Data | Decision Path | Cost |
|-----------------|----------|---------------|------|
| "My load?" | ACWR, ATL, CTL | Exact match → fast-path handler | $0 |
| "Am I ready to train?" | readiness, PHV, ACWR | Haiku classify → Output agent | ~$0.003 |
| "Compare me to peers" | benchmarkProfile | Haiku classify → benchmark tool | ~$0.003 |
| "How to improve speed?" | gaps, speedProfile, PHV | Fallthrough → Sonnet + RAG | ~$0.01 |
| "Can I do plyometrics?" | PHV, readiness, ACWR | Haiku → PHV guardrail + Output | ~$0.003 |
| "Plan my week" | full snapshot, calendar | Fallthrough → Sonnet + Timeline | ~$0.01 |

---

## PHV Maturation Reference (Mirwald et al. 2002)

| Stage | Offset | Loading | Focus |
|-------|--------|---------|-------|
| Pre-PHV | < -1.0yr | 70% | Coordination, speed, FMS |
| **Mid-PHV** | **-1.0 to +1.0** | **60%** | **NO max load, NO heavy barbell, -40% plyo** |
| Post-PHV | > +1.0yr | 85% | Gradual strength reintroduction |
| Adult (18+) | N/A | 100% | Full adult protocols |
