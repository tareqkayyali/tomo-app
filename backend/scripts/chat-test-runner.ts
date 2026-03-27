/**
 * Chat Test Runner — Automated E2E conversation testing for Tomo AI Chat.
 *
 * Usage:
 *   npx tsx scripts/chat-test-runner.ts                    # local (uses .env.local)
 *   npx tsx scripts/chat-test-runner.ts --prod             # production (uses .env.local.production)
 *   npx tsx scripts/chat-test-runner.ts --page Timeline    # filter by page
 *   npx tsx scripts/chat-test-runner.ts --verbose          # show full responses
 *   npx tsx scripts/chat-test-runner.ts --prod --verbose   # production + verbose
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
import { allScenarios } from "./chat-test-scenarios";
import type { TestConfig, ScenarioResult, TurnResult } from "./chat-test-types";
import { executeTurn } from "./chat-test-helpers";

const BASE_URL = IS_PROD
  ? (getArg("base-url") ?? "https://api.my-tomo.com")
  : (getArg("base-url") ?? "http://localhost:3000");
const PAGE_FILTER = getArg("page");
const VERBOSE = hasFlag("verbose");

// ── AUTH ─────────────────────────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email = getArg("email") ?? process.env.TEST_USER_EMAIL;
  const password = getArg("password") ?? process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    console.error("ERROR: Provide credentials via --email/--password args or TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.local");
    console.error("Example: npx tsx scripts/chat-test-runner.ts --prod --email you@example.com --password yourpass");
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
async function generateReport(results: ScenarioResult[], filename: string) {
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

  // Header styling
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

      // Color pass/fail
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
  console.log(`Filter: ${PAGE_FILTER ?? "all pages"}`);
  console.log(`Verbose: ${VERBOSE}\n`);

  const token = await getAuthToken();

  const config: TestConfig = {
    baseUrl: BASE_URL,
    authToken: token,
    timezone: "Asia/Riyadh",
    verbose: VERBOSE,
  };

  // Filter scenarios
  let scenarios = allScenarios;
  if (PAGE_FILTER) {
    scenarios = scenarios.filter((s) => s.page.toLowerCase() === PAGE_FILTER.toLowerCase());
    if (scenarios.length === 0) {
      console.error(`No scenarios found for page "${PAGE_FILTER}". Available: Timeline, Output, Mastery, Cross-Page`);
      process.exit(1);
    }
  }

  console.log(`Running ${scenarios.length} scenarios...\n`);

  const results: ScenarioResult[] = [];
  let testNum = 0;
  const totalTests = scenarios.reduce((s, sc) => s + sc.turns.length, 0);

  for (const scenario of scenarios) {
    const sessionId = randomUUID();
    const turnResults: TurnResult[] = [];
    let prevResponse: any = null;
    const scenarioStart = performance.now();

    for (let i = 0; i < scenario.turns.length; i++) {
      testNum++;
      const turn = scenario.turns[i];
      const result = await executeTurn(config, turn, sessionId, prevResponse, i);
      turnResults.push(result);
      prevResponse = result.rawResponse ?? null;

      const icon = result.pass ? "✅" : "❌";
      const costLabel = result.costTier === "capsule" ? "$0" : result.costTier;
      console.log(
        `  [${testNum}/${totalTests}] ${scenario.page} > ${scenario.name} (turn ${i + 1}) ... ${icon} ${result.pass ? "PASS" : "FAIL"} (${result.responseTimeMs}ms, ${costLabel})${result.error ? ` — ${result.error}` : ""}`
      );

      if (VERBOSE && result.rawResponse) {
        console.log(`    Cards: ${JSON.stringify(result.rawResponse?.structured?.cards?.map((c: any) => c.type) ?? [])}`);
        console.log(`    Chips: ${JSON.stringify(result.rawResponse?.structured?.chips?.map((c: any) => c.label) ?? [])}`);
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
    });
  }

  // Summary
  const allTurns = results.flatMap((r) => r.turns);
  const passed = allTurns.filter((t) => t.pass).length;
  const failed = allTurns.filter((t) => !t.pass).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Total: ${allTurns.length} | Pass: ${passed} | Fail: ${failed} | Rate: ${Math.round((passed / allTurns.length) * 100)}%`);

  // Generate Excel
  const timestamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const filename = `scripts/chat-test-report-${timestamp}.xlsx`;
  await generateReport(results, filename);
  console.log(`Report: ./${filename}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
