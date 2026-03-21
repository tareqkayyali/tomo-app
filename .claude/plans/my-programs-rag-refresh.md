# My Programs — RAG-Powered Personalized Recommendations

## Problem
My Programs currently uses `getInlinePrograms()` — a static, hardcoded engine that filters 31 football programs by position + age band + PHV stage. It doesn't consider the athlete's actual test results, vitals, readiness state, load metrics, training history, or real-time context. The Own It page already has a Claude-powered deep refresh system that analyzes the full athlete context — My Programs should use a similar approach.

## Solution
Add a **Claude-powered program recommendation engine** that analyzes the athlete's full data profile to generate intelligent, personalized program recommendations. This mirrors the Own It deep refresh pattern but is specifically tuned for training program selection.

---

## Implementation Steps

### Step 1: Backend — Create `deepProgramRefresh.ts`
**File**: `backend/services/programs/deepProgramRefresh.ts`

A new service modeled after `deepRecRefresh.ts` that:
1. Builds full `PlayerContext` (same 10 parallel data fetches as AI Chat)
2. Includes the current hardcoded program catalog (all 31 programs) in the prompt so Claude can SELECT and RANK from real programs
3. Sends athlete context + program catalog to Claude with a system prompt asking it to:
   - Select the most suitable programs for THIS athlete TODAY
   - Personalize priority (mandatory/high/medium) based on actual gaps, test results, vitals
   - Generate natural-language `impact` statements ("You ran a 4.2s 30m sprint — this program will shave 0.1s off")
   - Customize `reason` fields with specific data references
   - Adjust prescription based on readiness, PHV, load state
   - Add a `weeklyPlanSuggestion` that accounts for their actual schedule
4. Caches result in a new `athlete_program_recommendations` column on `athlete_snapshots` (JSONB) or a dedicated cache key
5. Staleness check: 12-hour expiry (programs change less often than Own It recs)

**System prompt will include:**
- Full athlete profile (sport, position, age band, PHV stage/offset)
- Current readiness state (energy, soreness, sleep, mood)
- Load metrics (ACWR, ATL, CTL, dual load index)
- Benchmark profile (percentile, strengths, gaps)
- Recent test results (last 5)
- Training history (sessions total, streak, training age)
- Health data (HRV, sleep quality, injury risk flag)
- The FULL program catalog (31 programs with categories, descriptions, prescriptions)
- Position training matrix (mandatory/recommended for their position)

**Output format:** Same as current `OutputSnapshot['programs']` so the frontend doesn't need structural changes.

### Step 2: Backend — Add API endpoint for program refresh
**File**: `backend/app/api/v1/programs/refresh/route.ts`

- `POST /api/v1/programs/refresh` — triggers deep program refresh (like `/recommendations/refresh`)
- Returns `{ refreshed: boolean, count: number }`
- Staleness check server-side (12h)
- `?force=true` bypasses staleness

### Step 3: Backend — Update output snapshot route
**File**: `backend/app/api/v1/output/snapshot/route.ts`

- Add a parallel fetch for cached AI program recommendations
- If AI-generated programs exist and are fresh (<12h), return those instead of `getInlinePrograms()`
- If no AI programs or they're stale, fall back to current hardcoded `getInlinePrograms()` (instant response)
- This ensures the page always loads fast (hardcoded fallback) while AI programs replace them when available

### Step 4: Frontend — Add deep refresh to `useOutputData.ts`
**File**: `mobile/src/hooks/useOutputData.ts`

Enhance the hook to mirror Own It's cache-then-fetch pattern:
1. Load cached programs from AsyncStorage (instant)
2. Fetch current snapshot from API (fast — hardcoded programs)
3. Trigger `POST /api/v1/programs/refresh` in background
4. When refresh completes, re-fetch snapshot (now has AI programs)
5. Add `isDeepRefreshing` state for UI indicator
6. Deduplication ref to prevent concurrent Claude calls
7. Re-trigger on screen focus (only for programs tab)

### Step 5: Frontend — Update `ProgramsSection.tsx`
**File**: `mobile/src/components/output/ProgramsSection.tsx`

- Add a subtle "AI-powered" badge when programs are AI-generated (vs hardcoded fallback)
- Add deep refresh indicator (small spinner + "Personalizing your programs...")
- Add pull-to-refresh force refresh for programs
- The existing UI structure (priority groups, program cards, impact statements) stays the same — only the DATA changes

### Step 6: Add `isAiGenerated` flag to programs response
The snapshot response gets a `programs.isAiGenerated: boolean` field so the frontend knows whether to show the AI badge or the fallback state.

---

## Architecture Flow

```
User opens Output → My Programs tab
  ↓
useOutputData() fetches /api/v1/output/snapshot
  → Returns hardcoded programs instantly (getInlinePrograms)
  ↓
Background: POST /api/v1/programs/refresh
  → Server checks staleness (12h)
  → If stale: buildPlayerContext() + Claude analysis
  → Claude selects & ranks from 31-program catalog
  → Stores result in cache (athlete_snapshots JSONB or AsyncStorage)
  ↓
Re-fetch snapshot → now returns AI-personalized programs
  → UI updates with richer impact statements, specific data references
  → "AI-powered ✨" badge appears
```

## Key Design Decisions
1. **Fallback-first**: Always show hardcoded programs instantly, replace with AI when ready
2. **12h staleness**: Programs don't change as fast as readiness recs (6h)
3. **Same output format**: No frontend structural changes needed — same priority groups, same cards
4. **Program catalog in prompt**: Claude selects FROM existing programs, doesn't invent new ones
5. **Cache in AsyncStorage**: Frontend caches last AI-generated programs for instant display on return
