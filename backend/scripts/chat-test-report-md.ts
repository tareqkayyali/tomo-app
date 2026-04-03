/**
 * Chat Test Markdown Report Generator — Structured eval output.
 *
 * Generates a markdown report with:
 *   - Critical safety findings (S4 failures first)
 *   - Suite summary table
 *   - Dimension breakdown
 *   - Cost analysis
 *   - Failure details with raw excerpts
 *   - Auto-generated recommendations
 */

import { writeFileSync, mkdirSync } from "fs";
import type { ScenarioResult, SuiteReport, TurnResult, DimensionScores } from "./chat-test-types";

export function buildSuiteReports(results: ScenarioResult[]): SuiteReport[] {
  const suiteMap = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const suite = r.suite ?? "legacy";
    if (!suiteMap.has(suite)) suiteMap.set(suite, []);
    suiteMap.get(suite)!.push(r);
  }

  const reports: SuiteReport[] = [];
  for (const [suiteId, scenarios] of suiteMap) {
    const allTurns = scenarios.flatMap((s) => s.turns);
    const passed = allTurns.filter((t) => t.pass).length;
    const failed = allTurns.filter((t) => !t.pass).length;
    const avgLatency = allTurns.length > 0
      ? allTurns.reduce((s, t) => s + t.responseTimeMs, 0) / allTurns.length
      : 0;
    const totalCost = allTurns.reduce((s, t) => s + (t.evalMetadata?.costUsd ?? 0), 0);

    const dimBreakdown: Record<keyof DimensionScores, { pass: number; fail: number }> = {
      routing: { pass: 0, fail: 0 },
      safety: { pass: 0, fail: 0 },
      relevance: { pass: 0, fail: 0 },
      format: { pass: 0, fail: 0 },
      cost: { pass: 0, fail: 0 },
      tone: { pass: 0, fail: 0 },
    };

    for (const t of allTurns) {
      if (!t.dimensionScores) continue;
      for (const dim of Object.keys(dimBreakdown) as (keyof DimensionScores)[]) {
        const val = t.dimensionScores[dim];
        if (dim === "relevance") {
          (val as number) >= 3 ? dimBreakdown[dim].pass++ : dimBreakdown[dim].fail++;
        } else {
          val === 1 ? dimBreakdown[dim].pass++ : dimBreakdown[dim].fail++;
        }
      }
    }

    reports.push({
      suiteId,
      totalScenarios: allTurns.length,
      passed,
      failed,
      passRate: allTurns.length > 0 ? passed / allTurns.length : 0,
      avgLatencyMs: avgLatency,
      totalCostUsd: totalCost,
      dimensionBreakdown: dimBreakdown,
      failures: allTurns.filter((t) => !t.pass),
    });
  }

  return reports.sort((a, b) => {
    // S4 first (safety), then by suite number
    if (a.suiteId === "s4") return -1;
    if (b.suiteId === "s4") return 1;
    return a.suiteId.localeCompare(b.suiteId);
  });
}

export function generateMarkdownReport(
  suiteReports: SuiteReport[],
  baseUrl: string
): string {
  const md: string[] = [];
  const timestamp = new Date().toISOString();

  // Header
  md.push("# Tomo AI Chat \u2014 Evaluation Report");
  md.push(`**Generated:** ${timestamp}`);
  md.push(`**Target:** ${baseUrl}`);
  md.push(`**Suites Run:** ${suiteReports.map((s) => s.suiteId).join(", ")}`);
  md.push(`**Total Scenarios:** ${suiteReports.reduce((a, s) => a + s.totalScenarios, 0)}`);
  md.push("");

  // CRITICAL SAFETY FINDINGS (always first)
  const s4 = suiteReports.find((s) => s.suiteId === "s4");
  if (s4 && s4.failed > 0) {
    md.push("## \ud83d\udea8 CRITICAL SAFETY FAILURES \u2014 MUST FIX BEFORE RELEASE");
    md.push("> PHV safety gate failures detected. The following scenarios allowed contraindicated");
    md.push("> exercises for Mid-PHV athletes. This is a severity-1 finding.");
    md.push("");
    for (const failure of s4.failures) {
      md.push(`### \u274c ${failure.message?.slice(0, 60)}`);
      md.push(`**Failure:** ${failure.error ?? "Unknown"}`);
      if (failure.evalFailureReasons?.length) {
        md.push(`**Eval Reasons:** ${failure.evalFailureReasons.join(" | ")}`);
      }
      md.push("");
    }
    md.push("---");
    md.push("");
  }

  // Suite Summary Table
  md.push("## Suite Summary");
  md.push("");
  md.push("| Suite | Scenarios | Passed | Failed | Pass Rate | Avg Latency | Total Cost |");
  md.push("|-------|-----------|--------|--------|-----------|-------------|------------|");
  for (const suite of suiteReports) {
    const passRate = `${(suite.passRate * 100).toFixed(1)}%`;
    const latency = `${suite.avgLatencyMs.toFixed(0)}ms`;
    const cost = `$${suite.totalCostUsd.toFixed(5)}`;
    const status = suite.passRate === 1.0 ? "\u2705" : suite.passRate >= 0.8 ? "\u26a0\ufe0f" : "\u274c";
    md.push(`| ${status} ${suite.suiteId} | ${suite.totalScenarios} | ${suite.passed} | ${suite.failed} | ${passRate} | ${latency} | ${cost} |`);
  }
  md.push("");

  // Dimension Breakdown
  const scoredSuites = suiteReports.filter(
    (s) => Object.values(s.dimensionBreakdown).some((d) => d.pass + d.fail > 0)
  );
  if (scoredSuites.length > 0) {
    md.push("## Dimension Scores");
    md.push("");
    md.push("| Suite | Routing | Safety | Relevance | Format | Cost | Tone |");
    md.push("|-------|---------|--------|-----------|--------|------|------|");
    for (const suite of scoredSuites) {
      const d = suite.dimensionBreakdown;
      const fmt = (dim: { pass: number; fail: number }) => {
        const total = dim.pass + dim.fail;
        return total > 0 ? `${dim.pass}/${total}` : "-";
      };
      md.push(
        `| ${suite.suiteId} | ${fmt(d.routing)} | ${fmt(d.safety)} | ${fmt(d.relevance)} | ${fmt(d.format)} | ${fmt(d.cost)} | ${fmt(d.tone)} |`
      );
    }
    md.push("");
  }

  // Cost Analysis
  const totalCost = suiteReports.reduce((a, s) => a + s.totalCostUsd, 0);
  const totalScenarios = suiteReports.reduce((a, s) => a + s.totalScenarios, 0);
  md.push("## Cost Analysis");
  md.push("");
  md.push("| Metric | Value |");
  md.push("|--------|-------|");
  md.push(`| Total eval run cost | $${totalCost.toFixed(5)} |`);
  md.push(`| Average cost per scenario | $${totalScenarios > 0 ? (totalCost / totalScenarios).toFixed(6) : "0"} |`);

  const s1 = suiteReports.find((s) => s.suiteId === "s1");
  if (s1) md.push(`| S1 Layer 1 scenarios (should be $0) | $${s1.totalCostUsd.toFixed(6)} |`);

  const s7 = suiteReports.find((s) => s.suiteId === "s7");
  if (s7) md.push(`| S7 Model routing total cost | $${s7.totalCostUsd.toFixed(6)} |`);
  md.push("");

  // Failure Details
  const allFailures = suiteReports.flatMap((s) => s.failures);
  if (allFailures.length > 0) {
    md.push("## Failure Details");
    md.push("");
    for (const suite of suiteReports) {
      if (suite.failures.length === 0) continue;
      md.push(`### Suite: ${suite.suiteId}`);
      md.push("");
      for (const failure of suite.failures) {
        const icon = failure.dimensionScores?.safety === 0 ? "\ud83d\udea8" : "\u274c";
        md.push(`#### ${icon} Turn ${failure.turnIndex + 1}: "${failure.message?.slice(0, 60)}"`);
        md.push(`**Error:** ${failure.error ?? "N/A"}`);
        if (failure.evalFailureReasons?.length) {
          md.push(`**Eval Reasons:** ${failure.evalFailureReasons.join(" | ")}`);
        }
        md.push(`**Model:** ${failure.evalMetadata?.modelUsed ?? "?"} | **Latency:** ${failure.responseTimeMs}ms | **Cost:** $${(failure.evalMetadata?.costUsd ?? 0).toFixed(6)}`);
        if (failure.dimensionScores) {
          const s = failure.dimensionScores;
          md.push(`**Scores:** Routing=${s.routing} Safety=${s.safety} Relevance=${s.relevance} Format=${s.format} Cost=${s.cost} Tone=${s.tone}`);
        }
        md.push("");
      }
    }
  }

  // Recommendations
  md.push("## Recommendations");
  md.push("");
  md.push("Auto-generated from failure patterns:");
  md.push("");

  const phvFailures = allFailures.filter((f) => f.dimensionScores?.safety === 0);
  if (phvFailures.length > 0) {
    md.push(`- \ud83d\udea8 **PHV Safety Gate:** ${phvFailures.length} safety failure(s). Review \`orchestrator.ts\` PHV overlay and \`chatGuardrails.ts\` enforcePHVSafety().`);
  }

  const routingFailures = allFailures.filter((f) => f.dimensionScores?.routing === 0);
  if (routingFailures.length > 0) {
    md.push(`- \u274c **Agent Routing:** ${routingFailures.length} routing failure(s). Check \`intentClassifier.ts\` thresholds and \`orchestrator.ts\` routing signals.`);
  }

  const costFailures = allFailures.filter((f) => f.dimensionScores?.cost === 0);
  if (costFailures.length > 0) {
    md.push(`- \u26a0\ufe0f **Cost Ceiling:** ${costFailures.length} scenario(s) exceeded cost threshold. Check for Layer 1 queries reaching Haiku/Sonnet.`);
  }

  const toneFailures = allFailures.filter((f) => f.dimensionScores?.tone === 0);
  if (toneFailures.length > 0) {
    md.push(`- \u26a0\ufe0f **Tone/Gen Z Rules:** ${toneFailures.length} tone failure(s). Review Gen Z formatting rules in static system prompt.`);
  }

  if (allFailures.length === 0) {
    md.push("- \u2705 No failures detected. All suites passing.");
  }

  return md.join("\n");
}

export function writeMarkdownReport(content: string, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filepath = `${outputDir}/tomo_eval_${timestamp}.md`;
  writeFileSync(filepath, content);
  return filepath;
}
