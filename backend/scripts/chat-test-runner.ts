/**
 * Chat Test Runner — Automated E2E conversation testing for Tomo AI Chat.
 *
 * Usage:
 *   npx tsx scripts/chat-test-runner.ts                          # legacy mode (all scenarios)
 *   npx tsx scripts/chat-test-runner.ts --prod                   # production
 *   npx tsx scripts/chat-test-runner.ts --page Timeline          # filter by page
 *   npx tsx scripts/chat-test-runner.ts --verbose                # show full responses
 *   npx tsx scripts/chat-test-runner.ts --eval                   # eval mode (6-dim scoring + markdown report)
 *   npx tsx scripts/chat-test-runner.ts --eval --suite s4        # eval: PHV safety suite only
 *   npx tsx scripts/chat-test-runner.ts --eval --suite s1,s2,s3  # eval: quick smoke
 *   npx tsx scripts/chat-test-runner.ts --eval --halt-on-safety  # halt on S4 failures
 */

import dotenv from "dotenv";

// ── CLI ARGS ─────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const IS_PROD = hasFlag("prod");

// Load the right env file BEFORE importing anything else
if (IS_PROD) {
  dotenv.config({ path: ".env.local.production" });
} else {
  dotenv.config({ path: ".env.local" });
}

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { allScenarios, evalSuites } from "./chat-test-scenarios";
import type { TestConfig, ScenarioResult, TurnResult, TestScenario } from "./chat-test-types";
import { executeTurn } from "./chat-test-helpers";
import { scoreTurn, isCriticalPass } from "./chat-test-scorer";
import { buildSuiteReports, generateMarkdownReport, writeMarkdownReport } from "./chat-test-report-md";

const BASE_URL = IS_PROD
  ? (getArg("base-url") ?? "https://api.my-tomo.com")
  : (getArg("base-url") ?? "http://localhost:3000");
const PAGE_FILTER = getArg("page");
const VERBOSE = hasFlag("verbose");
const EVAL_MODE = hasFlag("eval");
const SUITE_FILTER = getArg("suite");
const HALT_ON_SAFETY = hasFlag("halt-on-safety");

// ── AUTH ─────────────────────────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email = getArg("email") ?? process.env.TEST_USER_EMAIL;
  const password = getArg("password") ?? process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    console.error("ERROR: Provide credentials via --email/--password args or TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.local");
    console.error("Example: npx tsx scripts/chat-test-runner.ts --email you@example.com --password yourpass");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session?.access_token) {
    console.error("ERROR: Auth failed:", error?.message ?? "No session returned");
    process.exit(1);
  }

  console.log(`[auth] Signed in as ${email} (user: ${data.user?.id?.slice(0, 8)}...)`);
  return data.session.access_token;
}

// ── EXCEL REPORT ─────────────────────────────────────────
async function generateExcelReport(results: ScenarioResult[], filename: string) {
  const wb = new ExcelJS.Workbook();

  // ── Results Sheet ──
  const ws = wb.addWorksheet("Results");
  ws.columns = [
    { header: "Page", key: "page", width: 14 },
    { header: "Test Name", key: "name", width: 30 },
    { header: "Turn#", key: "turn", width: 7 },
    { header: "Message", key: "message", width: 45 },
    { header: "Expected Card", key: "expected", width: 25 },
    { header: "Actual Card", key: "actual", width: 25 },
    { header: "Pass/Fail", key: "result", width: 10 },
    { header: "Time (ms)", key: "time", width: 11 },
    { header: "Cost Tier", key: "cost", width: 10 },
    { header: "Confirmation", key: "confirm", width: 13 },
    { header: "Refresh", key: "refresh", width: 9 },
    { header: "Chips", key: "chips", width: 35 },
    { header: "Error", key: "error", width: 50 },
    { header: "Notes", key: "notes", width: 15 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B579A" } };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

  for (const scenario of results) {
    for (const turn of scenario.turns) {
      const row = ws.addRow({
        page: scenario.page,
        name: scenario.name,
        turn: turn.turnIndex + 1,
        message: turn.message.slice(0, 80),
        expected: turn.expectedCardType ?? "-",
        actual: turn.actualCardType ?? "-",
        result: turn.pass ? "PASS" : "FAIL",
        time: turn.responseTimeMs,
        cost: turn.costTier,
        confirm: turn.hasConfirmation ? "Yes" : "-",
        refresh: turn.hasRefreshTargets ? "Yes" : "-",
        chips: turn.chipLabels.join(", ").slice(0, 60),
        error: turn.error ?? "",
        notes: turn.notes,
      });

      const resultCell = row.getCell("result");
      if (turn.pass) {
        resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27AE60" } };
        resultCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      } else {
        resultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE74C3C" } };
        resultCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
    }
  }

  // ── Summary Sheet ──
  const summary = wb.addWorksheet("Summary");
  const totalTurns = results.flatMap((r) => r.turns);
  const passed = totalTurns.filter((t) => t.pass).length;
  const failed = totalTurns.filter((t) => !t.pass).length;
  const passRate = totalTurns.length > 0 ? Math.round((passed / totalTurns.length) * 100) : 0;

  summary.addRow(["AI Chat E2E Test Report"]).font = { bold: true, size: 16 };
  summary.addRow([`Run: ${new Date().toISOString()}`]);
  summary.addRow([`Target: ${BASE_URL}`]);
  summary.addRow([]);
  summary.addRow(["Total Tests", totalTurns.length]);
  summary.addRow(["Passed", passed]);
  summary.addRow(["Failed", failed]);
  summary.addRow(["Pass Rate", `${passRate}%`]);
  summary.addRow([]);

  // By page
  summary.addRow(["By Page", "Tests", "Pass", "Fail"]).font = { bold: true };
  const pages = [...new Set(results.map((r) => r.page))];
  for (const page of pages) {
    const pageTurns = results.filter((r) => r.page === page).flatMap((r) => r.turns);
    summary.addRow([page, pageTurns.length, pageTurns.filter((t) => t.pass).length, pageTurns.filter((t) => !t.pass).length]);
  }

  summary.addRow([]);
  summary.addRow(["By Cost Tier", "Count", "Avg Time (ms)"]).font = { bold: true };
  for (const tier of ["capsule", "haiku", "sonnet"] as const) {
    const tierTurns = totalTurns.filter((t) => t.costTier === tier);
    if (tierTurns.length > 0) {
      const avgTime = Math.round(tierTurns.reduce((s, t) => s + t.responseTimeMs, 0) / tierTurns.length);
      summary.addRow([tier, tierTurns.length, avgTime]);
    }
  }

  summary.getColumn(1).width = 20;
  summary.getColumn(2).width = 12;
  summary.getColumn(3).width = 12;
  summary.getColumn(4).width = 12;

  await wb.xlsx.writeFile(filename);
}

// ── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log("=== Tomo AI Chat E2E Test Runner ===\n");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Mode: ${EVAL_MODE ? "EVAL (6-dim scoring)" : "Legacy"}`);
  if (SUITE_FILTER) console.log(`Suite filter: ${SUITE_FILTER}`);
  if (PAGE_FILTER) console.log(`Page filter: ${PAGE_FILTER}`);
  console.log(`Verbose: ${VERBOSE}\n`);

  const token = await getAuthToken();

  const config: TestConfig = {
    baseUrl: BASE_URL,
    authToken: token,
    timezone: "Asia/Riyadh",
    verbose: VERBOSE,
    evalMode: EVAL_MODE,
  };

  // Select scenarios based on mode
  let scenarios: TestScenario[];

  if (EVAL_MODE && SUITE_FILTER) {
    // Eval mode with suite filter
    const suiteIds = SUITE_FILTER.split(",").map((s) => s.trim());
    scenarios = [];
    for (const id of suiteIds) {
      const suite = evalSuites[id];
      if (!suite) {
        console.error(`Unknown suite "${id}". Available: ${Object.keys(evalSuites).join(", ")}`);
        process.exit(1);
      }
      scenarios.push(...suite);
    }
  } else if (EVAL_MODE) {
    // Eval mode: all eval suites
    scenarios = Object.values(evalSuites).flat();
  } else {
    // Legacy mode: all scenarios (backward compat)
    scenarios = allScenarios;
  }

  // Page filter (works in both modes)
  if (PAGE_FILTER) {
    scenarios = scenarios.filter((s) => s.page.toLowerCase().includes(PAGE_FILTER.toLowerCase()));
    if (scenarios.length === 0) {
      console.error(`No scenarios found for filter "${PAGE_FILTER}".`);
      process.exit(1);
    }
  }

  console.log(`Running ${scenarios.length} scenarios...\n`);

  const results: ScenarioResult[] = [];
  let testNum = 0;
  const totalTests = scenarios.reduce((s, sc) => s + sc.turns.length, 0);
  let s4Failed = false;

  for (const scenario of scenarios) {
    const sessionId = randomUUID();
    const turnResults: TurnResult[] = [];
    let prevResponse: any = null;
    const scenarioStart = performance.now();

    for (let i = 0; i < scenario.turns.length; i++) {
      testNum++;
      const turn = scenario.turns[i];
      const result = await executeTurn(config, turn, sessionId, prevResponse, i);

      // Eval mode: run 6-dimension scorer
      if (EVAL_MODE && turn.evalExpected) {
        const { scores, failureReasons } = scoreTurn(turn, result);
        result.dimensionScores = scores;
        result.evalFailureReasons = failureReasons;

        // Override pass/fail: in eval mode, critical dimensions determine pass
        const criticalPass = isCriticalPass(scores, turn.tags ?? []);
        if (!criticalPass) {
          result.pass = false;
          if (!result.error) result.error = failureReasons.join("; ");
          else result.error += "; " + failureReasons.join("; ");
        }
      }

      turnResults.push(result);
      prevResponse = result.rawResponse ?? null;

      // Console output
      const icon = result.pass ? "\u2705" : "\u274c";
      const costLabel = result.costTier === "capsule" ? "$0" : result.costTier;
      const evalCost = result.evalMetadata?.costUsd != null
        ? ` $${result.evalMetadata.costUsd.toFixed(5)}`
        : "";
      const evalLayer = result.evalMetadata?.classifierLayer
        ? ` [L${result.evalMetadata.classifierLayer === "exact_match" ? "1" : result.evalMetadata.classifierLayer === "haiku" ? "2" : "3"}]`
        : "";
      console.log(
        `  [${testNum}/${totalTests}] ${scenario.page} > ${scenario.name} (turn ${i + 1}) ... ${icon} ${result.pass ? "PASS" : "FAIL"} (${result.responseTimeMs}ms, ${costLabel}${evalCost}${evalLayer})${result.error ? ` \u2014 ${result.error}` : ""}`
      );

      if (VERBOSE) {
        if (result.rawResponse) {
          console.log(`    Cards: ${JSON.stringify(result.rawResponse?.structured?.cards?.map((c: any) => c.type) ?? [])}`);
          console.log(`    Chips: ${JSON.stringify(result.rawResponse?.structured?.chips?.map((c: any) => c.label) ?? [])}`);
        }
        if (result.evalMetadata) {
          console.log(`    _eval: intent=${result.evalMetadata.intentId} agent=${result.evalMetadata.agentRouted} model=${result.evalMetadata.modelUsed} confidence=${result.evalMetadata.confidence?.toFixed(2)}`);
        }
        if (result.dimensionScores) {
          const s = result.dimensionScores;
          console.log(`    Scores: R=${s.routing} S=${s.safety} Rel=${s.relevance} F=${s.format} C=${s.cost} T=${s.tone}`);
        }
      }

      // Halt on S4 safety failure
      if (scenario.suite === "s4" && !result.pass) {
        s4Failed = true;
        if (HALT_ON_SAFETY) {
          console.log("\n\ud83d\udea8 CRITICAL: PHV safety failure detected. Halting run (--halt-on-safety).\n");
        }
      }
    }

    const scenarioTime = Math.round(performance.now() - scenarioStart);
    const allPass = turnResults.every((t) => t.pass);
    results.push({
      page: scenario.page,
      name: scenario.name,
      turns: turnResults,
      overallPass: allPass,
      totalTimeMs: scenarioTime,
      suite: scenario.suite,
    });

    if (HALT_ON_SAFETY && s4Failed) break;

    // Rate limit between scenarios (200ms)
    await new Promise((r) => setTimeout(r, 200));
  }

  // Summary
  const allTurns = results.flatMap((r) => r.turns);
  const passed = allTurns.filter((t) => t.pass).length;
  const failed = allTurns.filter((t) => !t.pass).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Total: ${allTurns.length} | Pass: ${passed} | Fail: ${failed} | Rate: ${Math.round((passed / allTurns.length) * 100)}%`);

  if (EVAL_MODE) {
    // Cost summary from _eval
    const totalCost = allTurns.reduce((s, t) => s + (t.evalMetadata?.costUsd ?? 0), 0);
    console.log(`Total API Cost: $${totalCost.toFixed(5)}`);

    // Suite breakdown
    const suiteReports = buildSuiteReports(results);
    console.log("\nSuite Breakdown:");
    for (const sr of suiteReports) {
      const icon = sr.passRate === 1.0 ? "\u2705" : sr.passRate >= 0.8 ? "\u26a0\ufe0f" : "\u274c";
      console.log(`  ${icon} ${sr.suiteId}: ${sr.passed}/${sr.totalScenarios} (${(sr.passRate * 100).toFixed(0)}%) | ${sr.avgLatencyMs.toFixed(0)}ms avg | $${sr.totalCostUsd.toFixed(5)}`);
    }

    // Generate markdown report
    const mdContent = generateMarkdownReport(suiteReports, BASE_URL);
    const mdPath = writeMarkdownReport(mdContent, "scripts/reports");
    console.log(`\nMarkdown Report: ./${mdPath}`);
  }

  // Generate Excel report (always)
  const timestamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const xlsxFilename = `scripts/chat-test-report-${timestamp}.xlsx`;
  await generateExcelReport(results, xlsxFilename);
  console.log(`Excel Report: ./${xlsxFilename}`);

  if (s4Failed) {
    console.log("\n\ud83d\udea8 WARNING: PHV Safety suite (S4) has failures. Review immediately.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
