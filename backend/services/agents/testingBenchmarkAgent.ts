/**
 * Testing & Benchmark Agent — TypeScript service layer
 *
 * Sprint 1 decomposition: extracted from Output agent.
 * Primary tools live in Python (ai-service/app/agents/tools/testing_benchmark_tools.py).
 * This file provides TS-side utilities used by bridge endpoints.
 *
 * Tools: get_test_results, get_test_catalog, get_benchmark_comparison,
 *        log_test_result, get_test_trajectory, create_test_session,
 *        get_combine_readiness_score, generate_test_report
 *
 * Bridge endpoints used:
 *   - POST /api/v1/tests         (log_test_result — already exists)
 *   - POST /api/v1/calendar/events (create_test_session — already exists)
 *
 * All read tools query Supabase directly from Python (no bridge needed).
 */

export const TESTING_BENCHMARK_AGENT_ID = "testing_benchmark";

export const TESTING_BENCHMARK_TOOLS = [
  "get_test_results",
  "get_test_catalog",
  "get_benchmark_comparison",
  "log_test_result",
  "get_test_trajectory",
  "create_test_session",
  "get_combine_readiness_score",
  "generate_test_report",
] as const;

export type TestingBenchmarkToolName = typeof TESTING_BENCHMARK_TOOLS[number];
