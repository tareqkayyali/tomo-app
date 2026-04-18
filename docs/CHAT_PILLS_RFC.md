# RFC — Chat Pills & Quotes CMS

**Status**: Draft · awaiting sign-off before implementation
**Author**: Claude (paired with Tareq)
**Date**: 2026-04-18
**Targets**: Mobile chat empty state, CMS admin, AI Chat response chips
**Related baselines**: `docs/BASELINE_AI_CHAT_MARCH2026.md`, `docs/AI_CHAT_DOCUMENTATION.md`

---

## 1. Problem

1. The **Proactive Dashboard** in the AI Chat empty state is too heavy — greeting + stat pills + today glance + notification card + chips. It duplicates info shown elsewhere (Own It, Triangle, Timeline) and obscures the simple "start a chat" intent.
2. **Empty-state action pills are hardcoded** in `CAPSULE_ACTIONS` (`HomeScreen.tsx:696`). No CMS control, no personalization, no usage feedback loop.
3. **In-response chips are hardcoded 46 times** across `responseFormatter.ts`, `quickActionFormatter.ts`, `intentHandlers.ts`, `orchestrator.ts`. Every new chip requires a code deploy. No central library, no tag-driven reuse.
4. **Motivational quotes are CMS-seeded** (`content_items` table, subcategories `high_energy|recovery|low_sleep|streak|general`) but there is no admin UI to add/edit them.

## 2. Goals

- **G1** Remove the Proactive Dashboard entirely (component + CMS config + types).
- **G2** New empty-state layout: `Quote → Next Block one-liner → 4 action pills`, always in that order, regardless of boot data state.
- **G3** One unified `chat_pills` library in CMS. Same pill can be used in empty-state tray and/or injected into AI responses.
- **G4** Fixed mode (admin picks 4) or Dynamic mode (user's top 4 most-used, padded with fixed fallback).
- **G5** Tag-driven injection of pills into AI response cards, controlled by a finite CMS-owned tag taxonomy — no free-form strings.
- **G6** CMS admin UI for quotes; no mobile code change required (quotes already flow from `content_items`).
- **G7** Zero regression of the March 2026 AI Chat baseline: in-response injection ships behind a flag, defaults OFF, enabled only after eval parity.

## 3. Non-goals (v1)

- Per-pill sport / age / position filters in the library. Tags are enough. Add filters only on a second concrete request.
- AI-generated pills. Library is human-curated.
- Pill A/B testing framework. Telemetry is written; experimentation is a later PR.
- Multi-language labels. English only. i18n is out of scope.
- Replacing the `CAPSULE_ACTIONS` pool in other screens (this RFC covers Chat only).

## 4. Design

### 4.1 Unified Pill Library (`ui_config.config_key = 'chat_pills'`)

```ts
interface ChatPillsConfig {
  version: 1;

  emptyState: {
    mode: 'fixed' | 'dynamic';
    fixedIds: string[];               // exactly 4 when mode='fixed'
    defaultFallbackIds: string[];     // exactly 4; padding for dynamic mode
  };

  inResponse: {
    enabled: boolean;                 // DEFAULT FALSE — flag gate
    maxPerResponse: number;           // 1..3, default 3
    shadowMode: boolean;              // log-only, no mutation
  };

  library: ChatPill[];
}

interface ChatPill {
  id: string;                         // slug, immutable once used in telemetry
  label: string;                      // <= 24 chars
  message: string;                    // prompt sent on tap
  enabled: boolean;
  allowInEmptyState: boolean;
  allowInResponse: boolean;
  tags: ContextTag[];                 // from finite taxonomy (see 4.3)
  excludeTags: ContextTag[];          // if any match response tags → skip
  priority: number;                   // 1..10, tiebreaker (higher wins)
}
```

### 4.2 Empty-state rendering logic

Mobile flow at `HomeScreen.tsx` when `messages.length === 0`:

```
┌ QuoteCard (always, drawn from content_items)
├ NextBlockLine ────────── "Next Block — <title> — <HH:mm>"
│                          fallback: "No upcoming block"
└ ChatActionPills ───────── exactly 4 pills
     fixed  : config.emptyState.fixedIds
     dynamic: GET /api/v1/chat/pills/most-used  (top 4 last-60d)
              pad with defaultFallbackIds in order, no dupes
     tap → handleChipPress(pill.message) + POST /pills/track
```

### 4.3 Tag Taxonomy (server-owned, finite, Zod-enforced)

```ts
type ContextTag =
  // Readiness
  | 'readiness:green' | 'readiness:yellow' | 'readiness:red'
  | 'needs_checkin' | 'stale_checkin'
  // Schedule
  | 'has_clash' | 'rest_day' | 'training_today' | 'match_today'
  | 'exam_today' | 'exam_soon' | 'empty_week' | 'schedule_gap'
  // Load
  | 'acwr_high' | 'acwr_low' | 'dual_load_high' | 'high_load' | 'low_load'
  // Benchmarks
  | 'benchmark_weak' | 'benchmark_strong' | 'metric_missing' | 'has_benchmarks'
  // Programs
  | 'no_programs' | 'has_programs' | 'recommendation_ready'
  // Lifecycle
  | 'new_user' | 'returning_user' | 'streak_risk' | 'streak_milestone'
  // Domain
  | 'injury' | 'recovery' | 'nutrition' | 'sleep' | 'growth' | 'cv_incomplete'
  // Response type
  | 'response:readiness' | 'response:schedule' | 'response:benchmark'
  | 'response:exam_week' | 'response:clash_fix' | 'response:programs'
  | 'response:session_plan' | 'response:text'
  // Fallback
  | 'always';
```

Taxonomy is defined in `backend/lib/chatPills/tagTaxonomy.ts` and exported as a single const frozen array. Admin UI populates its tag pickers from this list. Zod rejects anything outside.

### 4.4 Resolver contract

`backend/services/agents/chipResolver.ts`:

```ts
export function resolveChipsForContext(
  contextTags: ContextTag[],
  opts: {
    config: ChatPillsConfig;
    existingChips?: ActionChip[];   // for shadow-mode diffing only
  }
): { chips: ActionChip[]; resolvedPillIds: string[]; shadowDiff?: ShadowDiff };
```

**Algorithm**:
1. Filter `library` to `enabled && allowInResponse`.
2. For each pill: pass if `tags ∩ contextTags ≠ ∅` AND `excludeTags ∩ contextTags = ∅`.
3. If tag `always` is present in a pill and nothing else matches, it may win; normal pills always beat `always` pills.
4. Sort by priority DESC, then library order.
5. Return top `maxPerResponse`. If zero matched → return empty array (NO silent fallback to hardcoded chips).

Pure function. No I/O. No caching inside. Config is passed in. Makes it trivially unit-testable.

### 4.5 Chokepoint integration

Single site — `orchestrator.ts:589-601` — already runs `injectSessionPlanChips`:

```ts
if (structured) {
  injectSessionPlanChips(structured);

  // NEW
  if (pillsConfig.inResponse.shadowMode) {
    const shadow = resolveChipsForContext(structured.contextTags ?? [], { config: pillsConfig, existingChips: structured.chips });
    logger.info('[chipResolver.shadow]', { resolvedPillIds: shadow.resolvedPillIds, diff: shadow.shadowDiff });
  } else if (pillsConfig.inResponse.enabled) {
    const { chips, resolvedPillIds } = resolveChipsForContext(structured.contextTags ?? [], { config: pillsConfig });
    structured.chips = chips;
    logger.info('[chipResolver]', { resolvedPillIds });
  }
}
```

### 4.6 Builder contract

Each response builder in `responseFormatter.ts`, each intent handler in `intentHandlers.ts`, and each quick-action in `quickActionFormatter.ts` gains one new concern: emit `contextTags: ContextTag[]` on the `TomoResponse`.

Example:
```ts
export function buildReadinessResponse(data: ReadinessData): TomoResponse {
  return {
    headline: `You're ${data.score} today`,
    cards: [ /* ... */ ],
    chips: [ /* hardcoded fallback for PR1 */ ],
    contextTags: [
      'response:readiness',
      `readiness:${data.score}`,
      data.energy < 4 ? 'low_load' : 'high_load',
      data.sleep < 6 ? 'sleep' : null,
    ].filter(Boolean) as ContextTag[],
  };
}
```

In PR1 all builders keep their hardcoded `chips` arrays — only `contextTags` is added. PR2 deletes the hardcoded arrays across all 46 call sites in one commit.

## 5. Database

### Migration `00000000000057_chat_pills.sql` (PR1)

```sql
-- Usage telemetry
CREATE TABLE chat_pill_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pill_id    text        NOT NULL,
  source     text        NOT NULL CHECK (source IN ('empty_state','in_response')),
  used_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cpu_user_time  ON chat_pill_usage (user_id, used_at DESC);
CREATE INDEX idx_cpu_user_pill  ON chat_pill_usage (user_id, pill_id);
CREATE INDEX idx_cpu_pill_time  ON chat_pill_usage (pill_id, used_at DESC);

ALTER TABLE chat_pill_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpu_own_rows ON chat_pill_usage
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Seed the new config key
INSERT INTO ui_config (config_key, config_value)
VALUES ('chat_pills', '<full library JSON — see Appendix A>')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;

-- Atomic cutover: delete the old row in the same migration
DELETE FROM ui_config WHERE config_key = 'proactive_dashboard';
```

**Rollback** (`DOWN`):
```sql
DROP TABLE IF EXISTS chat_pill_usage;
DELETE FROM ui_config WHERE config_key = 'chat_pills';
```

Old `proactive_dashboard` row is **not** restored on rollback — if it is needed, redeploy the prior backend commit which seeds it.

## 6. APIs

### Public (mobile)
| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/config/bundle` | GET | Returns `chat_pills` (replaces `proactive_dashboard`) | Public |
| `/api/v1/chat/pills/most-used` | GET | Top 4 pill IDs last 60d, padded | Bearer |
| `/api/v1/chat/pills/track` | POST | `{ pillId, source }` | Bearer |

### Admin
| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/admin/chat-pills` | GET | Full config + tag taxonomy | Admin |
| `/api/v1/admin/chat-pills` | POST | Upsert config (Zod-validated) | Admin |
| `/api/v1/admin/content-items/quotes` | GET | List quotes | Admin |
| `/api/v1/admin/content-items/quotes` | POST | Create quote | Admin |
| `/api/v1/admin/content-items/quotes/[id]` | PATCH | Update | Admin |
| `/api/v1/admin/content-items/quotes/[id]` | DELETE | Delete | Admin |

### Deleted
| Route | Why |
|---|---|
| `/api/v1/admin/dashboard-config` | Proactive Dashboard gone |

## 7. CMS Admin UI

### 7.1 `/admin/chat-pills` — two-tab page

**Tab A — Empty State**
- Radio: Fixed / Dynamic.
- Fixed: 4 searchable dropdowns picking from `library` entries where `enabled && allowInEmptyState`. Validates exactly 4, no dupes, client-side + Zod server-side.
- Dynamic: read-only preview string ("Shows each user's 4 most-tapped pills from the last 60 days, padded with: <names>"), plus the same 4-dropdown editor for `defaultFallbackIds`.

**Tab B — Library**
- Table: Label · Message · Tags (pills) · Priority · Empty-state ✓ · In-response ✓ · Enabled ✓ · Actions.
- Add / Edit modal: all fields, tag multi-select fed from `GET /api/v1/admin/chat-pills` taxonomy.
- Priority column is drag-sortable.
- "Tag test" widget: textarea of JSON `{ contextTags: [...] }` → shows which pills would resolve in which order. Uses same `resolveChipsForContext` via a dry-run endpoint.

**Tab C — In-Response Settings (read-write but clearly flagged)**
- `inResponse.enabled` toggle (default OFF with warning copy: "Will change AI Chat behavior. Run eval harness first.").
- `shadowMode` toggle.
- `maxPerResponse` slider 1–3.

Styling reuses existing admin patterns (shadcn Table, Switch, Button, Dialog) — same as `/admin/dashboard-sections`.

### 7.2 `/admin/quotes`

- Table of rows from `content_items WHERE category='quote'`: Text, Author, Subcategory, Enabled.
- Add / Edit modal with subcategory dropdown (high_energy / recovery / low_sleep / streak / general).
- Delete with confirm.
- No mobile change — `useAllQuotes` already reads from `content_items`.

## 8. Telemetry

Every pill event writes to `ai_trace_log` (existing, migration 42):

```ts
logTrace('chat.pill.displayed',  { userId, pillId, source, contextTags });
logTrace('chat.pill.tapped',     { userId, pillId, source, msFromDisplay });
logTrace('chipResolver.resolved',{ contextTags, resolvedPillIds, matchCount, ms });
logTrace('chipResolver.shadow',  { contextTags, shadowPillIds, hardcodedChips, diff });
```

Plus the row in `chat_pill_usage` for dynamic-mode ranking.

## 9. Feature flags & kill-switches

All three are independent (not nested in a global flag):

| Flag | Surface | Default | Disable effect |
|---|---|---|---|
| `chat_pills.emptyState.mode='dynamic'` | Empty-state dynamic ranking | `fixed` | Falls back to fixed list |
| `chat_pills.inResponse.enabled` | In-response injection | `false` | Hardcoded builder chips used |
| `chat_pills.inResponse.shadowMode` | Shadow logging only | `false` | No logs written |

Flipping any flag requires a config save only — no deploy.

## 10. Rollout

| PR | Scope | Risk | Rollback |
|---|---|---|---|
| **PR1** | Infrastructure + Empty State + Quotes CMS + Shadow-mode chipResolver (dead code) | Low — AI Chat untouched; empty state is visually new but additive | `git revert <sha>` + `DELETE FROM ui_config WHERE config_key='chat_pills'` |
| **Interlude** | 2–3 days of shadow-mode in prod; compare resolved vs hardcoded chips; iterate on library & tags in CMS | None — log-only | n/a |
| **PR2** | `contextTags` emission across all 46 sites + chokepoint wire-up + delete hardcoded chips | Medium — changes AI Chat response chips | `git revert <sha>`; flip `chat_pills.inResponse.enabled=false` as immediate kill-switch |

**Gate for PR2 merge**: `npx tsx scripts/chat-test-runner.ts --eval --prod` passes with flag OFF (parity) and with flag ON. S4 PHV = 100% both runs.

## 11. Testing strategy

- **Unit (PR1)**: `chipResolver.test.ts` — 25+ fixture cases covering tag overlap, exclude-tags, priority sort, zero matches returns empty, `always` fallback, sport filter no-op.
- **Unit (PR1)**: `emptyStateResolver.test.ts` — fixed mode, dynamic mode with 0/1/2/3/4 history rows, disabled pill exclusion.
- **Integration (PR1)**: Supabase local `db reset` + test user → tap pills → verify rows in `chat_pill_usage` + `/most-used` ordering.
- **Integration (PR2)**: eval harness against all 8 suites; capture trace logs to confirm `contextTags` emission per builder.
- **Manual (PR1)**: localhost matrix documented in section 12.

## 12. Localhost verification matrix (PR1)

1. `cd backend && ./scripts/switch-env.sh local && npx supabase db reset && npm run dev`
2. `cd mobile && EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start -c`
3. Open chat (empty). Expect: Quote → `Next Block — <title> — <time>` → exactly 4 pills.
4. Tap pill → message sends, row in `chat_pill_usage`.
5. CMS Empty State → Dynamic. Tap "Plan My Week" 5× → reopen chat → it's first.
6. CMS Library → disable `plan_training`. Reopen chat → not shown; fallback pads the gap.
7. CMS Library → add new pill "Cool Down" tags `readiness:red,response:readiness`. Enable `shadowMode`. Send "how's my readiness" with red check-in → `[chipResolver.shadow]` log shows Cool Down resolved.
8. CMS Quotes → add new quote → new chat session → appears in rotation.
9. `npx tsc --noEmit` in both `backend/` and `mobile/` → 0 errors.
10. Screenshots captured for the PR description.

## 13. Open decisions locked by this RFC

1. ✅ Exactly **4 pills** in empty-state tray, always.
2. ✅ Dynamic mode pads from `defaultFallbackIds` in defined order when history < 4.
3. ✅ Tag taxonomy is finite, server-owned, Zod-enforced — no free text.
4. ✅ Resolver returns empty array on zero matches — **no silent fallback to hardcoded chips**.
5. ✅ Per-pill sport/age filters deferred (Rule of Three).
6. ✅ Proactive Dashboard row deleted in the same migration that seeds `chat_pills` — atomic cutover, no zombie config.
7. ✅ In-response injection default OFF; enabled only after shadow-mode parity + eval green.
8. ✅ All 46 hardcoded chip arrays migrated in PR2 — no partial state.

## 14. Appendix A — Seed library (PR1)

Starter entries (pill id → label → message → tags):

| ID | Label | Message | Tags | Empty? | Response? |
|---|---|---|---|---|---|
| `plan_study` | Plan Study | `plan my study schedule` | `exam_soon,schedule_gap,response:text` | ✅ | ✅ |
| `plan_training` | Plan Training | `plan my training week` | `empty_week,schedule_gap,has_programs,response:session_plan` | ✅ | ✅ |
| `plan_my_week` | Plan My Week | `help me plan my week` | `empty_week,schedule_gap,always` | ✅ | ✅ |
| `check_benchmarks` | Check My Benchmarks | `show me my benchmarks` | `has_benchmarks,response:benchmark,always` | ✅ | ✅ |
| `log_test` | Log a test | `I want to log a new test` | `metric_missing,response:benchmark` | ✅ | ✅ |
| `check_in` | Check in | `check in` | `needs_checkin,stale_checkin` | ✅ | ✅ |
| `add_event` | Add event | `I want to add a training session` | `empty_week,rest_day` | ✅ | ✅ |
| `strengths_gaps` | My strengths | `what are my strengths and gaps?` | `has_benchmarks,benchmark_weak,benchmark_strong` | ✅ | ✅ |
| `leaderboard` | Leaderboard | `show me the leaderboard` | `always,has_benchmarks` | ✅ | ❌ |
| `my_rules` | My rules | `edit my schedule rules` | `has_clash,schedule_gap` | ✅ | ✅ |
| `check_conflicts` | Check conflicts | `check for any schedule conflicts` | `has_clash,response:clash_fix` | ✅ | ✅ |
| `my_programs` | My programs | `my programs` | `has_programs,no_programs,response:programs` | ✅ | ✅ |
| `growth_stage` | Growth stage | `calculate my growth stage` | `growth,cv_incomplete` | ✅ | ❌ |
| `notification_settings` | Notifications | `notification settings` | `always` | ❌ | ❌ |
| `my_readiness` | My readiness | `what's my readiness?` | `response:readiness,needs_checkin,always` | ✅ | ✅ |
| `my_streak` | My streak | `my streak` | `streak_milestone,streak_risk` | ❌ | ✅ |
| `edit_cv` | Edit CV | `edit my CV profile` | `cv_incomplete` | ❌ | ✅ |
| `my_timeline` | My timeline | `help me manage my timeline` | `empty_week,schedule_gap` | ✅ | ✅ |

Defaults: `emptyState.fixedIds = ['plan_study','plan_training','plan_my_week','check_benchmarks']`. Same list for `defaultFallbackIds`.

## 15. Appendix B — Files touched

**PR1 (additive + empty-state swap)**
- `backend/supabase/migrations/00000000000057_chat_pills.sql` (new)
- `backend/lib/chatPills/tagTaxonomy.ts` (new)
- `backend/lib/chatPills/schema.ts` (new, Zod)
- `backend/services/agents/chipResolver.ts` (new, dead code in PR1)
- `backend/app/api/v1/config/bundle/route.ts` (edit — swap key)
- `backend/app/api/v1/chat/pills/most-used/route.ts` (new)
- `backend/app/api/v1/chat/pills/track/route.ts` (new)
- `backend/app/api/v1/admin/chat-pills/route.ts` (new)
- `backend/app/api/v1/admin/content-items/quotes/route.ts` (new)
- `backend/app/api/v1/admin/content-items/quotes/[id]/route.ts` (new)
- `backend/app/admin/(dashboard)/chat-pills/page.tsx` (new)
- `backend/app/admin/(dashboard)/quotes/page.tsx` (new)
- `backend/components/admin/AdminSidebar.tsx` (edit — rename link, add Quotes)
- `backend/app/api/v1/admin/dashboard-config/route.ts` (delete)
- `mobile/src/components/chat/ProactiveDashboard.tsx` (delete)
- `mobile/src/components/chat/NextBlockLine.tsx` (new)
- `mobile/src/components/chat/ChatActionPills.tsx` (new)
- `mobile/src/services/configService.ts` (edit — replace types)
- `mobile/src/screens/HomeScreen.tsx` (edit — rewrite empty-state block, delete CAPSULE_ACTIONS & RandomCapsuleChips)
- `backend/services/agents/chipResolver.test.ts` (new)

**PR2 (in-response wiring)**
- `backend/services/agents/responseFormatter.ts` (edit — emit contextTags, delete hardcoded chips)
- `backend/services/agents/intentHandlers.ts` (edit — same)
- `backend/services/agents/quickActionFormatter.ts` (edit — same)
- `backend/services/agents/orchestrator.ts` (edit — chokepoint)
- `mobile/src/types/chat.ts` (edit — add `contextTags?`)
- `backend/services/agents/chipResolver.integration.test.ts` (new)

## 16. Sign-off

- [ ] Tareq — product & architecture
- [ ] Eval harness run with flag OFF → baseline parity
- [ ] Eval harness run with flag ON → S4 PHV 100%, S1–S8 ≥ 80% pass
- [ ] Localhost matrix (§12) all green
