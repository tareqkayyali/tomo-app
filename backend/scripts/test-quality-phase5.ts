/**
 * Phase 5 sanity check — exercises the pure-TS algorithms without needing
 * Supabase. Catches regressions in the math and rule logic before deploying.
 *
 * Run:
 *   cd backend && npx tsx scripts/test-quality-phase5.ts
 *
 * Exit code 0 = all pass. Non-zero = at least one failure logged to stderr.
 */

import { welchTTest } from "../services/quality/shadow";
import {
  detectEmpathyTrigger,
  detectActionTrigger,
} from "../services/quality/triggers";
import { runRuleJudge } from "../services/quality/ruleJudges";
import {
  mapPythonAgent,
  computeFellThrough,
} from "../services/quality/index";
import { patternMatches } from "../services/quality/autoRepair";
import type {
  AthleteContext,
  TurnCapture,
} from "../services/quality/types";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    process.stdout.write(`  ok  ${label}\n`);
  } else {
    failed++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    process.stderr.write(`  FAIL ${msg}\n`);
  }
}

function approx(a: number, b: number, tol = 1e-3): boolean {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// 1. Welch t-test sanity
//    Known textbook values from NIST / scipy.stats.ttest_ind(equal_var=False)
// ---------------------------------------------------------------------------

function testWelch(): void {
  process.stdout.write("\n[welch]\n");

  // Identical samples → p ≈ 1
  {
    const a = [0.8, 0.82, 0.78, 0.81, 0.79];
    const b = [0.8, 0.82, 0.78, 0.81, 0.79];
    const p = welchTTest(a, b);
    check("identical samples → p≈1", p !== null && p > 0.99, `got p=${p}`);
  }

  // Strongly different means, tight variance → p very small
  {
    const a = [0.9, 0.91, 0.89, 0.92, 0.88, 0.9, 0.91, 0.89, 0.92, 0.9];
    const b = [0.5, 0.51, 0.49, 0.52, 0.48, 0.5, 0.51, 0.49, 0.52, 0.5];
    const p = welchTTest(a, b);
    check("strong difference → p < 0.001", p !== null && p < 0.001, `got p=${p}`);
  }

  // Small real difference with moderate n — p < 0.05
  {
    const a = [0.75, 0.78, 0.8, 0.77, 0.79, 0.81, 0.76, 0.78, 0.8, 0.77, 0.79, 0.78];
    const b = [0.7, 0.71, 0.73, 0.69, 0.72, 0.7, 0.71, 0.72, 0.7, 0.69, 0.72, 0.71];
    const p = welchTTest(a, b);
    check("moderate diff → p < 0.05", p !== null && p < 0.05, `got p=${p}`);
  }

  // n < 2 in either side → null
  {
    const p = welchTTest([0.5], [0.6, 0.7]);
    check("n=1 → null", p === null);
  }
}

// ---------------------------------------------------------------------------
// 2. Empathy + Action triggers
// ---------------------------------------------------------------------------

function testTriggers(): void {
  process.stdout.write("\n[triggers]\n");

  // Empathy triggers
  const emotional = [
    "I'm so stressed about exam week I can't sleep",
    "My knee has been hurting for a week",
    "I hate that coach dropped me",
    "Parents won't let me train this weekend",
  ];
  for (const msg of emotional) {
    const r = detectEmpathyTrigger(msg);
    check(`empathy fires: "${msg.slice(0, 40)}..."`, r.triggered);
  }

  // False positives that should NOT trigger
  const neutral = [
    "What should I do today?",
    "My 20m sprint was 3.2 seconds",
    "I passed my exam",
    "I tested my 1RM squat",
  ];
  for (const msg of neutral) {
    const r = detectEmpathyTrigger(msg);
    check(`empathy quiet: "${msg.slice(0, 40)}..."`, !r.triggered);
  }

  // Action-seeking triggers
  const seeking = [
    "What should I do today?",
    "How should I train this week?",
    "Help me with my warmup",
    "Can you build me a recovery plan?",
  ];
  for (const msg of seeking) {
    const r = detectActionTrigger(msg);
    check(`action fires: "${msg.slice(0, 40)}..."`, r.triggered);
  }

  const notSeeking = [
    "My knee hurts",
    "I ran 3.2 on the 20m",
    "Tell me about nutrition",  // informational, not directive
  ];
  for (const msg of notSeeking) {
    const r = detectActionTrigger(msg);
    check(`action quiet: "${msg.slice(0, 40)}..."`, !r.triggered);
  }
}

// ---------------------------------------------------------------------------
// 3. Rule Judge — smoke tests on hand-crafted examples
// ---------------------------------------------------------------------------

function testRuleJudge(): void {
  process.stdout.write("\n[rule-judge]\n");

  const ctx: AthleteContext = {
    userId: "test-u15",
    sport: "football",
    position: "striker",
    ageBand: "u15",
    phvStage: "post_phv",
  };

  // Off-voice response (forbidden phrases)
  {
    const turn: TurnCapture = {
      traceId: "t1",
      turnId: "tu1",
      sessionId: null,
      userId: ctx.userId,
      userMessage: "What should I do today?",
      assistantResponse:
        "Great question! I'd be happy to help. As an AI language model, I recommend you train.",
      activeTab: null,
      agent: "orchestrator",
      hasRag: false,
      intentConfidence: null,
      fellThrough: false,
      safetyGateTriggered: false,
    };
    const r = runRuleJudge(turn, ctx, {
      empathyTriggered: false,
      actionTriggered: true,
    });
    check(
      "forbidden phrases → tone ≤ 0.3 (hard cap)",
      (r.scores.tone ?? 1) <= 0.3,
      `got tone=${r.scores.tone}, violations=${r.violations.join(",")}`
    );
  }

  // On-voice directive response
  {
    const turn: TurnCapture = {
      traceId: "t2",
      turnId: "tu2",
      sessionId: null,
      userId: ctx.userId,
      userMessage: "What should I do today?",
      assistantResponse:
        "Do 25 min easy, then 3x20m strides at 80%. Recover tomorrow — we hit speed Thursday.",
      activeTab: null,
      agent: "timeline",
      hasRag: false,
      intentConfidence: null,
      fellThrough: false,
      safetyGateTriggered: false,
    };
    const r = runRuleJudge(turn, ctx, {
      empathyTriggered: false,
      actionTriggered: true,
    });
    check(
      "on-voice directive → tone ≥ 0.85",
      (r.scores.tone ?? 0) >= 0.85,
      `got tone=${r.scores.tone}`
    );
    check(
      "actionability ≥ 0.7 when action trigger fires",
      (r.scores.actionability ?? 0) >= 0.7,
      `got actionability=${r.scores.actionability}`
    );
    check(
      "personalization ≥ 0.5 (mentions no sport/position, should be 0 on football check)",
      r.scores.personalization !== null,
      `got personalization=${r.scores.personalization}`
    );
  }

  // U13 response with banned acronyms → age_fit should drop
  {
    const u13Ctx: AthleteContext = { ...ctx, ageBand: "u13" };
    const turn: TurnCapture = {
      traceId: "t3",
      turnId: "tu3",
      sessionId: null,
      userId: ctx.userId,
      userMessage: "Why am I tired?",
      assistantResponse:
        "Your ACWR is elevated, VO2 recovery requires CNS offload; your HRV baseline has shifted.",
      activeTab: null,
      agent: "output",
      hasRag: false,
      intentConfidence: null,
      fellThrough: false,
      safetyGateTriggered: false,
    };
    const r = runRuleJudge(turn, u13Ctx, {
      empathyTriggered: false,
      actionTriggered: false,
    });
    check(
      "U13 + acronyms → age_fit ≤ 0.4",
      (r.scores.age_fit ?? 1) <= 0.4,
      `got age_fit=${r.scores.age_fit}`
    );
  }

  // Conditional nulls
  {
    const turn: TurnCapture = {
      traceId: "t4",
      turnId: "tu4",
      sessionId: null,
      userId: ctx.userId,
      userMessage: "Tell me a fact",
      assistantResponse: "Football is a team sport.",
      activeTab: null,
      agent: "orchestrator",
      hasRag: false,
      intentConfidence: null,
      fellThrough: false,
      safetyGateTriggered: false,
    };
    const r = runRuleJudge(turn, ctx, {
      empathyTriggered: false,
      actionTriggered: false,
    });
    check("empathy null when not triggered", r.scores.empathy === null);
    check("actionability null when not triggered", r.scores.actionability === null);
  }
}

// ---------------------------------------------------------------------------
// 4. Python-agent mapping + fell_through derivation
// ---------------------------------------------------------------------------

function testEnvelopeMapping(): void {
  process.stdout.write("\n[envelope-mapping]\n");

  check("performance → output", mapPythonAgent("performance") === "output");
  check("planning → timeline", mapPythonAgent("planning") === "timeline");
  check("identity → mastery", mapPythonAgent("identity") === "mastery");
  check("unknown → orchestrator", mapPythonAgent("whatever") === "orchestrator");
  check("null → orchestrator", mapPythonAgent(null) === "orchestrator");
  check("timeline passthrough", mapPythonAgent("timeline") === "timeline");

  check("exact_match → !fellThrough", !computeFellThrough("exact_match"));
  check("capsule → !fellThrough", !computeFellThrough("capsule"));
  check("fast_path → !fellThrough", !computeFellThrough("fast_path"));
  check("agent_lock → fellThrough", computeFellThrough("agent_lock"));
  check("null → fellThrough", computeFellThrough(null));
  check("undefined → fellThrough", computeFellThrough(undefined));
}

// ---------------------------------------------------------------------------
// 5. Auto-repair pattern matching
// ---------------------------------------------------------------------------

function testPatternMatching(): void {
  process.stdout.write("\n[auto-repair]\n");

  const u13ToneDrift = {
    id: "p1",
    pattern_name: "u13_tone_drift",
    description: null,
    detection_spec: {
      type: "cusum_drift",
      dimension: "age_fit",
      segment: { age_band: "u13" },
    },
    affected_files: [],
    patch_spec: {},
    status: "active",
    times_triggered: 0,
  };

  check(
    "matches U13 age_fit alert",
    patternMatches(u13ToneDrift, {
      id: "a1",
      dimension: "age_fit",
      segment_key: { kind: "age_band", age_band: "u13" },
      baseline_mean: null,
      current_mean: null,
      cusum_value: null,
      window_days: 7,
      status: "open",
      matched_pattern_id: null,
    })
  );

  check(
    "does not match U17 age_fit alert",
    !patternMatches(u13ToneDrift, {
      id: "a2",
      dimension: "age_fit",
      segment_key: { kind: "age_band", age_band: "u17" },
      baseline_mean: null,
      current_mean: null,
      cusum_value: null,
      window_days: 7,
      status: "open",
      matched_pattern_id: null,
    })
  );

  check(
    "does not match U13 tone (wrong dim)",
    !patternMatches(u13ToneDrift, {
      id: "a3",
      dimension: "tone",
      segment_key: { kind: "age_band", age_band: "u13" },
      baseline_mean: null,
      current_mean: null,
      cusum_value: null,
      window_days: 7,
      status: "open",
      matched_pattern_id: null,
    })
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main(): void {
  process.stdout.write("Phase 5 sanity check\n");
  process.stdout.write("====================\n");

  testWelch();
  testTriggers();
  testRuleJudge();
  testEnvelopeMapping();
  testPatternMatching();

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.stderr.write(`\nFAILURES:\n`);
    for (const f of failures) process.stderr.write(`  - ${f}\n`);
    process.exit(1);
  }
  process.exit(0);
}

main();
