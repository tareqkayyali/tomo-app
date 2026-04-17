# AI Chat Quality Audit — 2026-04-15

**Context**: 4-turn session captured in mobile screenshots + 6h insights export (`tomo-ai-insights-all-2026-04-15T18-48.json`, 103 traces, 4 recent sessions in window).

**Scope**: Diagnosis only. Implementation lands after **Phase 6** (retire `footballPrograms.ts`).

**Verdict**: The conversation shown is **structurally broken** across four independent dimensions — context retention, intent routing, RAG grounding, and visual consistency. None of the four failures is a new bug; all four are emergent from the current agent/flow architecture. The fix is not tactical — it requires the **AI Chat Standardization Pass** (Phase 7) to land a unified flow contract, a unified response schema (Title → Card → Pills), and a single context ledger across agent handoffs.

---

## 1. Session reconstructed

| Turn | User message | System response | Card shape |
|---|---|---|---|
| 0 | "Hey Tomo, how am I doing on my benchmarks?" | Title + body + 3 stat cards (P-tier style: `4.0s — P99 1-Test Agility`, `2.1s — P1 10m Sprint`, `48% tested Profile Completeness`) + 2 chips (`Schedule test battery`, `See my trajectory`) | **Pattern A**: Stat-triplet + chips |
| 1 | "What training programs I should focus on?" | Title + body + 3 stat-style cards but different semantics (`5 solid Programs Active`, `Spiked Training Load`, `10m accel… Sprint Gap`) + 2 chips (`Build acceleration session`, `Show my week`) | **Pattern B**: Stat-triplet repurposed as "program status" — no actual program list |
| 2 | "Create a sprint mechanics session for today" | Title-only, **no body**, fork choice card (`Add drills to Speed & Acceleration Session at 6…` / `Book a new session instead`), no chips | **Pattern C**: Fork choice, no chips |
| 3 | "It's already 9:40 and the speed session already passed at 6 pm!" | Title "Got your speed dialled in" + short body + large session_plan card (8 drills, 68 min, Green readiness), no chips | **Pattern D**: Session plan card |

**Four different response patterns in one session.** This is the first and most visible problem.

---

## 2. Critical failures (in severity order)

### F1 — Misclassification of a frustration/reschedule signal `CRITICAL`

> Turn 3: **"It's already 9:40 and the speed session already passed at 6 pm!"**

This is not a `build_session` command. It is a **frustration signal combined with a temporal constraint violation**. The correct routing is one of:

- `reschedule_event` (the 6pm session needs to be moved or deleted)
- `acknowledge_setback` → open coaching response ("Totally get it — let's move it to tomorrow. Same focus or swap to recovery?")
- At minimum: `emotional_statement` → smalltalk with empathy

Instead, the classifier fired `build_session` again and the flow happily emitted "Got your speed dialled in" with a fresh session plan. **The athlete said the session passed and got told a session was ready.** This is the single worst moment in the conversation.

**Root cause**: the Haiku classifier's CRITICAL RULES still bias toward action verbs. Rule 14 ("mood statements → open_coaching") does not catch *temporal* frustration patterns like "already X o'clock and Y already passed". No rule exists for missed-session signals.

**Fix (Phase 7)**: add Rule 15 — temporal failure signals (`already passed`, `already too late`, `missed it`, `it's X:XX and Y`) → route to a new `missed_session` intent that hands off to a reschedule flow with empathic acknowledgment. The flow must *never* default-build a fresh session when the user signaled a failure.

---

### F2 — `build_session` has 0% RAG coverage `CRITICAL`

Confirmed by the insights export:

> *"`build_session` failure is urgent: 1 training design query with 0% RAG retrieval. Verify routing rules — this intent must trigger RAG every time."*

**Wait — Phase 1 of the enterprise push (plan file `pure-gathering-teacup.md`) already shipped RAG into `_build_session_step`.** Why is the 6h window still showing 0%?

**Hypothesis**: the RAG retrieval at line 1181 of `multi_step.py` is running, but the **insights analyzer is measuring a different signal** — it's looking at the graph-path `rag_retrieval` node, which is intentionally skipped when `route_decision="flow_handled"`. The flow-path metadata IS emitted (we thread `rag_meta` back into the return dict), but the trace analyzer may only count graph-path retrievals as "RAG coverage."

**Action for Phase 7**:
1. Verify with a live chat that `_retrieve_session_rag` is firing end-to-end on Railway (tail for `build_session rag chunks=N`).
2. If it's firing, fix the insights analyzer to count flow-path RAG metadata.
3. If it's NOT firing, the Phase 1 ship regressed — likely a silent exception or the module-level flag is false in prod.

---

### F3 — "What training programs should I focus on?" returned a stat-triplet, not a program list `HIGH`

Turn 1 should have returned:
- Title: "You've got the technical foundation — acceleration is the gap" ✓
- Body: brief rationale ✓
- **Card: a list of 3-5 actual programs from `training_programs` table scoped to the athlete's focus + position + readiness** ✗
- Pills: follow-up actions ✓

Instead it returned three **metric cards** (`5 solid Programs Active`, `Spiked Training Load`, `10m accel… Sprint Gap`). Those metric cards answer "how's my training going?", not "what programs should I focus on?". The athlete asked for a list; the system showed a dashboard.

**Root cause**: the Performance agent has no `recommend_programs` tool that hits `training_programs` with the canonical recommendation engine. It falls back to its generic card-builder which knows how to render readiness metrics, so that's what it emits.

**Why this is fixable cheaply post-Phase 6**: Phase 6 moves `deepProgramRefresh` + `programGuardrails` off `footballPrograms.ts` onto `training_programs`. Phase 7 then wires a new tool `recommend_programs_for_athlete` that returns 3-5 DB rows. The existing eager-load + mobile rendering already knows how to display linked-program rows.

---

### F4 — Zero context threading across 4 turns `HIGH`

Confirmed by the insights export:

> *"Benchmark discussion (turn 2) never connects to sprint mechanics request (turn 4). No 'based on your acceleration gap we identified earlier' or session-planning continuity."*

Turn 0 established: **acceleration is the gap**. That single fact should have been the spine of every subsequent turn:

- Turn 1 ("what programs"): "Here are 3 programs that target acceleration specifically…"
- Turn 2 ("sprint mechanics session"): "Good call — this ties to the 10m gap we talked about. Building a focused block now."
- Turn 3 (frustration): "The 6pm one passed — want me to move the *acceleration-focused* block to tomorrow?"

Instead, every turn read the athlete's message in isolation. The agent-dispatch system prompt carries `conversation_history`, but **the key facts from turn 0 were never distilled into a "session memory" object** that the classifier and the flow controller can both read.

**Root cause**: `conversation_history.py` has a 5000-token raw-text budget (`KEEP_RECENT=4`), but no **structured** extraction of "what have we agreed on so far". The orchestrator replays the transcript and hopes Sonnet picks up the thread; it doesn't reliably.

**Fix (Phase 7)**: a new `SessionMemory` object populated after every turn via a cheap Haiku extraction pass (~$0.0002/turn):
```
{
  "identified_gaps": ["acceleration (10m)"],
  "identified_strengths": ["agility P99"],
  "committed_actions": [],
  "open_threads": ["programs recommendation"],
  "athlete_mood": "engaged"
}
```
Injected into every agent system prompt as a dedicated "WHAT WE'VE ALREADY ESTABLISHED" block. Bumps cost ~5% per turn, eliminates the disconnected-QA feel entirely.

---

### F5 — Dead-end fork at 9:40pm `HIGH`

Turn 2's fork offered `Add drills to Speed & Acceleration Session at 6pm`. The current time was **9:40pm**. The 6pm session had already passed. The fork presented an option that was physically impossible.

**Root cause**: the fork is built by `_build_fork_choice` which queries `calendar_events` for today's sessions and presents any as attach candidates — **no time-of-day filtering against `now()`**.

**Fix (small, pre-Phase 7)**: filter the fork candidates by `start_at >= now() - 30min` (30-min grace for late starts). Past events should never appear as attach targets. One-line change inside the flow.

---

### F6 — Four different card shapes in one session `MEDIUM`

This is the design-consistency problem the user flagged. Four patterns:

1. **A** (stat triplet + chips) — benchmarks
2. **B** (stat triplet repurposed as programs) — hacked around missing recommend tool
3. **C** (fork choice, no body, no chips) — multi_step fork
4. **D** (session_plan card, no chips) — multi_step confirm

User's requested target: **Title → Card with details → Pills**, for every response, every time.

**The contract that Phase 7 should enforce**:

```
ResponseEnvelope {
  title: string                   // required, <80 chars
  body: string                    // required, <300 chars, ONE sentence
  card: Card                      // required, one of 8 typed variants
  pills: Pill[]                   // required, 2-4 items, never empty except on confirm success
}
```

Eight card variants covering every use case, no free-form fallbacks:

| # | Card type | Used for |
|---|---|---|
| 1 | `stat_triplet` | Benchmarks, readiness, vitals |
| 2 | `program_list` | Program recommendations (Phase 7 new) |
| 3 | `session_plan` | Built session drill list |
| 4 | `fork_choice` | Multi-step disambiguation |
| 5 | `confirm_action` | Write-action approval |
| 6 | `event_list` | Timeline / schedule view |
| 7 | `insight_card` | Coaching moment / observation |
| 8 | `text_only` | Smalltalk, empathy, open coaching |

Every agent writes into the same envelope. Every envelope renders through **one** mobile component (`ResponseRenderer`) with **one** card dispatcher. No more `_build_text_response` + `format_response Case 5` + `multi_step structured = {...}` divergence — all three funnel through `build_response_envelope(title, body, card, pills)`.

---

### F7 — Dual-load stress undetected `HIGH`

Insights confirms: *"Athlete message 'It's already 9:40 and the speed session already passed' signals time pressure + missed training, yet no Tomo response acknowledges compounded academic-athletic stress."*

This is the dual-load detector the user deferred earlier in the pure-gathering-teacup plan. It's now reasserting as a real gap — a U19 at 9:40pm missing a 6pm session is exactly the profile the detector was designed to catch.

**Fix (Phase 7 bundle)**: ship the dual-load detector alongside standardization. Triggers: time-of-day >= 21:00 AND user mentions missed session, school, homework, exam, exhausted, too much. Cheap — runs as a pre-classifier regex + a single Haiku call if regex fires.

---

### F8 — 4 of 4 sessions in danger ACWR (>1.5) got no mitigation tool `HIGH`

From the insights:
> *"Critical safety gap: 4 of 4 sessions in danger ACWR (>1.5) with zero mitigation tool deployment. 1 danger-zone session received zero coaching intervention."*

The athlete whose chat we're auditing is **in the danger zone for ACWR**, yet the system happily offered to build another sprint session. No load-reduction guardrail fired.

**Root cause**: the safety gate that Phase 2 of the safety-gate work shipped is ENV-gated OFF (`FLOW_READINESS_GATE_ENABLED=false` per `multi_step.py:727`). It was disabled during UX iteration and never re-enabled.

**Fix (immediate, no code change)**: flip `FLOW_READINESS_GATE_ENABLED=true` on Railway ai-service. The code already exists.

**Fix (Phase 7)**: the safety gate needs a UX pass so the "dial back" recommendation is warm and specific, not a generic block. That's why it was disabled. It's part of the standardization work.

---

## 3. Severity matrix

| # | Failure | Severity | Owner phase |
|---|---|---|---|
| F1 | Frustration/missed-session misclassified | CRITICAL | Phase 7 |
| F2 | `build_session` RAG reported 0% | CRITICAL | Phase 7 (verify first) |
| F3 | No `recommend_programs` tool — returns dashboard instead of list | HIGH | Phase 7 (post-Phase 6) |
| F4 | Zero context threading across turns | HIGH | Phase 7 |
| F5 | Past-time events shown as attach targets | HIGH | Quick fix, pre-Phase 7 |
| F6 | Four different card shapes in one session | MEDIUM (visible to user) | Phase 7 |
| F7 | Dual-load stress undetected | HIGH | Phase 7 |
| F8 | ACWR danger-zone safety gate disabled | HIGH | Env flag flip, immediate |

---

## 4. Phase 7 charter — "AI Chat Standardization Pass"

**Lands after Phase 6 ships cleanly.** Not before.

### Non-negotiable outputs

1. **Single `ResponseEnvelope` contract** — all agents + flows emit `{title, body, card, pills}`. Eight typed card variants. Mobile has one renderer. Legacy divergent paths (`_build_text_response`, `format_response Case 5`, per-flow structured dicts) are deleted.

2. **`SessionMemory` context object** — extracted after every turn via cheap Haiku pass, injected into every downstream agent prompt. Identified gaps, committed actions, open threads, mood. Fixes F4 end-to-end.

3. **Intent classifier expansion** — new intents:
   - `missed_session` (temporal failure signals) → reschedule flow with empathy
   - `recommend_programs` → DB-backed list from `training_programs`
   - `dual_load_check` (fires on time + academic + fatigue cluster) → wellness check-in
   - `ack_frustration` → smalltalk-with-empathy handler

4. **Flow-path RAG telemetry fix** — flow-handled paths must count toward "RAG coverage" in the insights analyzer. Either fix the analyzer or unify the metadata emit path.

5. **Safety gate re-enable (with warm UX)** — `FLOW_READINESS_GATE_ENABLED=true`, with the dial-back response reshaped into the standard envelope (title + warm body + alternative card + pills).

6. **Dual-load detector** — regex pre-filter + single Haiku classification, triggers on the `(time_late ∧ missed_session)` ∨ `(academic_mention ∧ fatigue_signal)` clusters.

7. **Past-event filter in fork builder** — one-line guard: `events.filter(e => e.endAt > now())`.

### Explicit scope guards

- **No new DB migrations** unless a new card variant demands it.
- **No mobile changes** beyond one `ResponseRenderer` refactor to a single switch over `card.type`.
- **Every new LLM call gated behind a feature flag** with default-off rollout in first 24h.
- **Phase 7 does NOT rebuild the agent architecture** — it standardizes the wire format between agents, not the agents themselves. Output / Performance / Planning / Mastery all stay.

### Success criteria

- 100% of responses match the `ResponseEnvelope` contract (schema validation at emit time).
- `build_session` RAG coverage reported ≥ 95% in the insights analyzer.
- `missed_session` test case in the 95-scenario eval harness: 100% pass.
- Context-threading eval (new suite): score ≥ 80% on multi-turn coherence prompts.
- No more than 1 distinct card shape per turn in a manually-captured 6-turn session.

---

## 5. Immediate quick wins (pre-Phase 7)

These three are safe to ship in isolation before the big standardization pass:

1. **Flip `FLOW_READINESS_GATE_ENABLED=true`** on Railway ai-service (no code change, reverts F8 instantly).
2. **One-line past-event filter** in `multi_step.py::_build_fork_choice` (fixes F5).
3. **Verify `build_session` RAG is actually firing** via Railway logs — tail for `build_session rag chunks=`. If it's not, Phase 1 regressed and that's a 10-minute fix.

All three can ship today. Everything else waits for Phase 6 completion, then Phase 7 lands as the single biggest quality push since the baseline.

---

*Audit saved for Phase 7 kickoff. Phase 6 (`deepProgramRefresh` / `programGuardrails` / snapshot off `footballPrograms.ts`) ships first. No Phase 7 work begins until Phase 6 is green.*
