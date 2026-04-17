# The Week Planner — Build Plan

## Locked decisions (2026-04-17)
1. Categories: the existing 8 in `training_category_templates`.
2. Default per-session intensity: MODERATE (builder assigns, athlete can override in edit).
3. Study blocks: `calendar_events(event_type='study')` with subject in `title`. No satellite table.
4. Compliance source: a `completed` toggle on `calendar_events`.
5. Snapshot storage: Option A — dedicated `athlete_week_plans` table.

## Scope guardrails (non-goals for v1)
- No per-session focus rotation inside one category.
- No multi-week mesocycle periodization.
- No cross-sport templates.
- No AI-written coaching annotations per session.
- No Whoop recovery signal in builder (readiness_rag + ACWR only).

---

## Build order

### Step 1 — Engine (DONE)
- [x] Migration `056_week_planner.sql` — new table + RLS + calendar_events.completed/completed_at
- [x] `backend/services/weekPlan/weekPlanBuilder.ts` — pure function (484 lines)
- [x] `backend/services/weekPlan/__tests__/weekPlanBuilder.test.ts` — 13 fixtures covering empty, flexible, fixed, fixed-distribution, study, match, day-lock (flex + fixed), existing-event buffer, league+exam cap, exam-subject morning boost, summary, sort
- [x] Full-repo `tsc --noEmit` clean
- [x] `npx tsx …test.ts` → 13 passed, 0 failed

**Bugs found + fixed during step 1:**
1. Fixed-days distribution — when N sessions matched N fixed days, all sessions landed on first day. Fixed by round-robin-assigning one fixedDay per candidate.
2. `autoPosition` ignores `dayOfWeek`, so school hours never mechanically blocked. Fixed by injecting school hours as a synthetic `ScheduleEvent` with the real start/end times before calling `autoPosition` — the engine's gap rules then apply naturally.

### Step 2 — Endpoints + event (DONE)
- [x] `POST /api/v1/week-plan/draft` — pure builder wrapper, returns preview
- [x] `POST /api/v1/week-plan/validate-edit` — single-item edit validation against live constraints (conflicts, buffers, school, day bounds, day locks)
- [x] `POST /api/v1/week-plan/commit` — batch insert events + write plan row + supersede any prior active plan + emit `WEEK_PLAN_CREATED`
- [x] `GET /api/v1/week-plan/suggest?weekStart=…` — catalog defaults + adaptive deltas from last completed plan
- [x] `WEEK_PLAN_CREATED` event type + added to `PROGRAM_REFRESH_TRIGGERS` + case in processor (no dedicated handler — commit endpoint writes the row)
- [x] `WeekPlanCreatedPayload` in types.ts union
- [x] Shared `weekPlanContext.ts` loader — one place where all four endpoints gather live state
- [x] `tsc --noEmit` clean across the repo
- [x] Smoke test: all 4 routes return 401 without auth (reachable + auth-gated)

### Step 3 — Python flow (DONE)
- [x] `build_week_plan` intent in `intent_registry.py` with 10 examples covering "plan my week", "build my week", "set up my week", "build me a complete week plan", etc.
- [x] Deprecated `integrated_plan` intent (removed from intent_registry + FLOW_REGISTRY)
- [x] Removed broken `generate_integrated_weekly_plan` tool (dual_load_tools, bridge whitelist, tools/__init__)
- [x] `_BUILD_WEEK_PLAN_STEPS` in `registry.py` — 7 steps (pick_week → load_suggestions → pick_training_mix → pick_study_plan → build_draft → review_week_plan → confirm_week_plan)
- [x] New `FlowConfig("build_week_plan", pattern="multi_step", steps=_BUILD_WEEK_PLAN_STEPS)`
- [x] 4 new `_present_*` handlers in `multi_step.py`: `_present_week_scope_choice`, `_present_training_mix_capsule`, `_present_study_plan_capsule`, `_present_week_plan_preview_capsule`, `_present_week_plan_confirm`
- [x] 3 new card-type dispatches in `_execute_current_step` (training_mix_capsule, study_plan_capsule, week_plan_preview_capsule)
- [x] 3 new continuation handlers in `execute_multi_step_continuation` (training_mix, study_plan, preview with inline edit)
- [x] Helper functions: `_resolve_week_start_from_message`, `_extract_capsule_payload`, `_coerce_training_mix`, `_coerce_study_mix`, `_apply_draft_edit`
- [x] `_call_step_tool` bridged for `get_week_plan_suggestions` (GET /suggest) + `build_week_plan_draft` (POST /draft)
- [x] `_execute_confirm_tool` branches on `flow.intent_id == "build_week_plan"` → bridge POST /api/v1/week-plan/commit
- [x] All Python files parse clean, supervisor graph builds clean, unit assertions for helpers all pass

### Step 4 — Mobile capsules (DONE)
- [x] `types/chat.ts` — 3 new capsule types (TrainingMixCapsule, StudyPlanCapsule, WeekPlanPreviewCapsule) + shared types (TrainingMixItem, StudyMixItem, WeekPlanPreviewItem, WeekPlanSummary, WeekPlanWarning, category/placement/time enums)
- [x] `TrainingMixCapsule.tsx` — per-category row with sessions/duration/placement pills, fixed-days multi-select
- [x] `StudyPlanCapsule.tsx` — per-subject row with sessions/duration, inline add-subject, exam badge
- [x] `WeekPlanPreviewCapsule.tsx` — grouped-by-day list, tappable rows open inline edit panel (reuses PillSelector + CapsuleDateChip), Accept → advance, all Array.isArray-guarded per baseline rule #7
- [x] `CapsuleRenderer.tsx` — 3 new switch cases + `isCapsuleCard()` list updated
- [x] `tsc --noEmit` clean across all week-plan files (3 pre-existing errors in `ProtocolBannerSection.tsx` are unrelated)

**Deliberately skipped** (design choice, not shortcut):
- No `WeekScopeCapsule` — pick_week step reuses the existing `choice_card` type (simpler + already renders correctly in every Tomo theme).
- No standalone `WeekPlanEditCapsule` — edit is an inline panel inside `WeekPlanPreviewCapsule`, matching the "tap-to-edit" flow the user asked for.
- No new `services/api.ts` wrappers needed — all week-plan HTTP calls go through the Python bridge. Mobile only submits via `capsuleAction`.

### Step 5 — Compliance + adaptive (DONE)
- [x] `backend/services/weekPlan/complianceComputer.ts` — pure function: classifies each planned calendar_event as completed / skipped / missing (deleted), computes `compliance_rate`, per-category rate, load achieved vs predicted, avg readiness from checkins in the window
- [x] `/api/v1/cron/compute-week-compliance/route.ts` — scans `athlete_week_plans` with status=active whose week fully ended, computes, writes back + flips status to `completed`. Idempotent. CRON_SECRET-gated (503 when unset as fail-safe; 403 on wrong secret).
- [x] Suggest endpoint already uses compliance history (Step 2) — verified it reads `prior.compliance_rate` + `prior.inputs` to adapt next week's mix.
- [x] `completed` toggle added to `PATCH /api/v1/calendar/events/[id]` — same endpoint, new boolean field; manages `completed_at` transitions (sets on false→true, nulls on undo).
- [x] Full-repo `tsc --noEmit` clean.

**Deliberately deferred:**
- Mobile UI for the complete toggle — timeline event tap. Scope of that change affects every event-list component; belongs in a dedicated UI session, not bundled with the week planner.
- Per-category compliance-driven upward nudges (+1 when ≥95% + stable ACWR). Needs 4+ weeks of history before kicking in; implementation when we have that data.

### Step 6 — Ship
- [ ] Feature flag `week_plan_enabled` in ai-service config
- [ ] Enable on 2 test accounts for 1 week
- [ ] Full rollout

---

## Review section (filled after each step)

### Step 1 review
(to be written when step 1 completes)
