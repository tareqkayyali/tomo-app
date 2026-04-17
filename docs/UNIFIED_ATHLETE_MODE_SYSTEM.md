# Unified Athlete Mode System — Schedule + Study + Training Integration

## Context

Tomo's scheduling currently uses two binary flags (`league_is_active`, `exam_period_active`) that combine into 4 hardcoded scenarios. This is rigid — athletes can't express nuanced intent like "I'm in exam mode but still want light training" or "I'm resting but want to maintain study habits." The study and training plan generators run as isolated modules that don't read from the athlete snapshot or CMS-managed parameters.

**Goal**: Replace the binary flag system with a first-class **Athlete Mode** concept (Study / League / Balanced / Rest) that flows through the entire Data Fabric, is CMS-configurable, and drives both study and training plan generation with snapshot-aware intelligence.

---

## Architecture Overview

```
CMS Admin Panel
  │ (configure mode definitions, training category templates, protocol params)
  ▼
athlete_modes table ──── training_category_templates table
  │                              │
  ▼                              ▼
Player selects mode ────────► PATCH /api/v1/preferences
  │                              │
  ▼                              ▼
MODE_CHANGE event ──────────► eventProcessor → modeChangeHandler
  │                              │
  ▼                              ▼
athlete_snapshots              triggerRecommendationComputation()
  (athlete_mode,                 (mode-aware thresholds)
   mode_changed_at,              │
   study_training_balance)       ▼
  │                            Deep Program Refresh
  ▼                              (if stale)
Plan Generators read snapshot + mode params
  │
  ├── studyPlanGenerator(modeContext, snapshotState)    [$0]
  └── trainingPlanGenerator(modeContext, snapshotState) [$0]
  │
  ▼
calendar_events → bridgeToEventStream → back to Layer 1
```

---

## Phase 1: Database + CMS Tables

### Migration 031: New tables + schema changes

**New table: `athlete_modes`** (CMS-managed mode definitions)
```sql
create table athlete_modes (
  id text primary key,              -- 'study', 'league', 'balanced', 'rest'
  label text not null,
  description text,
  icon text,                        -- Ionicons name
  color text,                       -- Hex color
  sort_order int default 0,
  params jsonb not null default '{}',
  sport_filter text[] default null, -- null = all sports
  is_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**`params` JSONB shape** (all CMS-tunable):
```typescript
{
  maxHardPerWeek: number,              // cap hard sessions
  maxSessionsPerDay: number,           // daily session cap
  studyDurationMultiplier: number,     // 1.0 = normal, 1.5 = exam boost
  reduceGymDaysTo: number | null,      // null = no reduction
  dropPersonalDev: boolean,
  intensityCapOnExamDays: 'REST' | 'LIGHT' | 'MODERATE' | null,
  addRecoveryAfterMatch: boolean,
  studyTrainingBalanceRatio: number,   // 0.0 (all training) → 1.0 (all study)
  loadCapMultiplier: number,           // 0.0–1.0 applied to training load ceiling
  aiCoachingTone: 'supportive' | 'performance' | 'balanced' | 'academic',
  priorityBoosts: { category: string, delta: number }[],
  referenceTemplates: Record<string, TemplateEvent[]>
}
```

**Seed 4 built-in modes** using current `SCENARIO_MODIFIERS` values:
| Mode | Balance Ratio | Hard/Week | Study Mult | Load Cap | Tone |
|------|--------------|-----------|------------|----------|------|
| `balanced` | 0.5 | 3 | 1.0 | 1.0 | balanced |
| `league` | 0.2 | 2 | 0.8 | 0.9 | performance |
| `study` | 0.8 | 1 | 1.5 | 0.6 | academic |
| `rest` | 0.5 | 0 | 1.0 | 0.3 | supportive |

**New table: `training_category_templates`** (CMS-managed, replaces hardcoded categories)
```sql
create table training_category_templates (
  id text primary key,
  label text not null,
  icon text not null,
  color text not null,
  default_mode text default 'fixed_days',
  default_days_per_week int default 3,
  default_session_duration int default 60,
  default_preferred_time text default 'afternoon',
  sort_order int default 0,
  sport_filter text[] default null,
  is_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
Seed with current hardcoded values: club, gym, personal, recovery.

**Alter `player_schedule_preferences`**: Add `athlete_mode text default 'balanced'`, `mode_changed_at timestamptz`, `mode_params_override jsonb default '{}'`.

**Alter `athlete_snapshots`**: Add `athlete_mode text`, `mode_changed_at timestamptz`, `study_training_balance_ratio numeric`.

**RLS**: Public SELECT on both new tables, admin-only INSERT/UPDATE/DELETE.

### Files to create/modify:
- `backend/supabase/migrations/00000000000031_athlete_modes.sql` (new)

---

## Phase 2: Backend — Event Pipeline + Mode Config

### 2a. New event type: `MODE_CHANGE`
- Add to `backend/services/events/constants.ts` → `EVENT_TYPES`
- Add payload type to `backend/services/events/types.ts`:
  ```typescript
  interface ModeChangePayload {
    previous_mode: string;
    new_mode: string;
    mode_params: Record<string, unknown>;
    trigger: 'manual' | 'auto';
  }
  ```
- Add to `EVENT_TO_REC_TYPES`: `MODE_CHANGE → ['READINESS', 'LOAD_WARNING', 'ACADEMIC', 'RECOVERY']`

### 2b. New handler: `modeChangeHandler.ts`
- `backend/services/events/handlers/modeChangeHandler.ts` (new)
- Fetches CMS mode params → merges with player override → writes to snapshot
- Register in `eventProcessor.ts` switch block

### 2c. Mode config service
- `backend/services/scheduling/modeConfig.ts` (new)
- `getModeDefinition(modeId)` — cached 5 min, reads from `athlete_modes`
- `getAvailableModes(sport?)` — for mobile mode selector
- `clearModeConfigCache()` — called after CMS save
- Follows `recommendationConfig.ts` caching pattern

### 2d. Add snapshot fields to registry
- `backend/services/programs/snapshotFieldRegistry.ts` — add 3 new fields
- `backend/services/events/types.ts` — update `AthleteSnapshot` interface
- Visibility: ATHLETE full, COACH visible, PARENT visible

### Files to create/modify:
- `backend/services/events/constants.ts` (modify — add MODE_CHANGE)
- `backend/services/events/types.ts` (modify — add payload + snapshot fields)
- `backend/services/events/eventProcessor.ts` (modify — register handler)
- `backend/services/events/handlers/modeChangeHandler.ts` (new)
- `backend/services/scheduling/modeConfig.ts` (new)
- `backend/services/programs/snapshotFieldRegistry.ts` (modify)

---

## Phase 3: Schedule Rule Engine Refactor

### 3a. Add mode-aware function (additive, no breaking changes)

Keep `getEffectiveRules()` as synchronous fallback. Add:

```typescript
export async function getEffectiveRulesWithMode(
  prefs: PlayerSchedulePreferences,
  modeParams: ModeParams,
): EffectiveRules
```

Merges: `MASTER_RULES` (hardcoded floor) + `modeParams` (CMS) + `prefs.mode_params_override` (player).

### 3b. Update `buildRuleContext()` for AI prompt

Replace scenario text with mode context:
```
Active mode: Study — Academic focus, reduced training load
Balance: 80% study / 20% training  
Coaching tone: academic
```

### 3c. Migration bridge

```typescript
export function migrateScenarioToMode(prefs): string {
  if (prefs.league_is_active && prefs.exam_period_active) return 'league';
  if (prefs.league_is_active) return 'league';
  if (prefs.exam_period_active) return 'study';
  return 'balanced';
}
```

### Files to modify:
- `backend/services/scheduling/scheduleRuleEngine.ts`

---

## Phase 4: CMS Admin Panel

### 4a. Admin services
- `backend/services/admin/modeAdminService.ts` (new) — CRUD for `athlete_modes`
- `backend/services/admin/trainingCategoryAdminService.ts` (new) — CRUD for `training_category_templates`

### 4b. Validation schemas
- `backend/lib/validation/modeSchemas.ts` (new) — Zod schemas for mode params + training categories

### 4c. API routes
- `backend/app/api/v1/admin/modes/route.ts` (new) — admin CRUD
- `backend/app/api/v1/admin/training-categories/route.ts` (new) — admin CRUD
- `backend/app/api/v1/content/modes/route.ts` (new) — public read
- `backend/app/api/v1/content/training-categories/route.ts` (new) — public read

### 4d. Admin pages
- `backend/app/admin/(dashboard)/modes/page.tsx` (new) — Mode definitions editor with JSON param editor
- `backend/app/admin/(dashboard)/training-categories/page.tsx` (new) — Category template manager

---

## Phase 5: Plan Generators + AI Integration

### 5a. Study plan generator — add `modeContext` param

`mobile/src/services/studyPlanGenerator.ts` — optional `modeContext`:
```typescript
modeContext?: {
  modeId: string;
  studyDurationMultiplier: number;
  studyTrainingBalanceRatio: number;
  snapshotState?: { readiness_rag, academic_load_7day, sleep_quality, wellness_trend };
}
```
- If `readiness_rag === 'RED'` + mode 'study': extend study sessions (athlete resting from training)
- If `academic_load_7day > 70` + mode 'balanced': shorten sessions, prevent burnout
- All pure function logic, **$0 cost**

### 5b. Training plan generator — add `modeContext` param

`mobile/src/services/trainingPlanGenerator.ts` — optional `modeContext`:
```typescript
modeContext?: {
  modeId: string;
  loadCapMultiplier: number;
  maxHardPerWeek: number;
  reduceGymDaysTo: number | null;
  snapshotState?: { readiness_rag, acwr, dual_load_index };
}
```
- `loadCapMultiplier` caps intensity per mode
- `reduceGymDaysTo` trims gym days in study/league modes
- All pure function logic, **$0 cost**

### 5c. Training categories from CMS

Player's `training_categories` JSONB stays as their personalized config. The CMS `training_category_templates` table provides the master list of available categories. Mobile fetches templates from `/api/v1/content/training-categories`.

### 5d. AI agent context

- `backend/services/agents/contextBuilder.ts` — add `activeMode` + `modeParams` to PlayerContext
- `backend/services/agents/orchestrator.ts` — inject mode-aware coaching tone block in system prompt
- Mode context adds ~200 tokens to system prompt ($0 incremental)

### 5e. Recommendation computers

- `academicComputer`: mode 'study' → boost academic rec priority P3→P2
- `loadWarningComputer`: mode 'rest' → lower ACWR danger threshold 1.5→1.2
- `recoveryComputer`: mode 'league' → always emit recovery rec after match

---

## Phase 6: Mobile UI

### 6a. Mode selector
- Horizontal card row (4 modes from CMS) on settings or dashboard
- PATCH to `/api/v1/preferences` → emits `MODE_CHANGE` event
- Selected mode shows with `athlete_modes.color` border

### 6b. Subject entry (enhancement of existing)
- Surface more prominently when mode is 'study' or 'balanced'
- Smart preview: "Based on your exams + current load, here's your plan"

### 6c. Training category config (enhancement of existing)
- Category templates from CMS instead of hardcoded
- Mode change suggests category adjustments

---

## Phase 7: Migration + Backfill

1. Run migration 031
2. Seed 4 built-in modes + category templates
3. One-time SQL to map existing flags → athlete_mode column
4. Emit MODE_CHANGE events for active users to populate snapshots
5. After mobile adoption > 95%, deprecate `league_is_active` / `exam_period_active` (keep columns, stop reading)

---

## Cost Summary

| Operation | Cost | Notes |
|-----------|------|-------|
| Mode change → event → snapshot | $0 | Pure DB |
| Study/training plan generation | $0 | Pure TS functions |
| CMS config reads | $0 | Cached 5 min |
| Schedule rule engine | $0 | Pure functions |
| Recommendation computers | $0 | Rule-based |
| AI system prompt (mode context) | $0 incr. | ~200 extra tokens |
| Deep Program Refresh | ~$0.02-0.05 | Existing, triggered if stale |

**Net new AI cost per mode change: ~$0**

---

## Verification Plan

1. **Migration**: Run `npx supabase db reset` locally, verify tables + seed data
2. **CMS Admin**: Navigate `/admin/modes/` and `/admin/training-categories/`, CRUD test
3. **Event pipeline**: POST a mode change, verify snapshot updated, recs triggered
4. **Plan generators**: Generate study + training plans with different modes, verify output differences
5. **AI agents**: Chat "plan my training" in study mode vs league mode, verify tone + recommendations differ
6. **Mobile**: Mode selector → verify PATCH → event → snapshot → plan regeneration chain
7. **Migration bridge**: Existing users with `league_is_active=true` get `athlete_mode='league'` after backfill
