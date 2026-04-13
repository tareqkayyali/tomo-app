/**
 * Dual-Load Agent — TypeScript service layer
 *
 * Sprint 2 — Tomo's commercial differentiator: athletic + academic balance.
 * Primary tools live in Python (ai-service/app/agents/tools/dual_load_tools.py).
 *
 * Tools: get_dual_load_dashboard, get_cognitive_readiness_windows,
 *        get_exam_collision_forecast, set_academic_priority_period,
 *        generate_integrated_weekly_plan, set_academic_stress_level
 *
 * Bridge endpoints:
 *   - POST /api/v1/dual-load/academic-priority (NEW)
 *   - POST /api/v1/dual-load/integrated-plan (NEW)
 *   - POST /api/v1/dual-load/stress (NEW)
 */

export const DUAL_LOAD_AGENT_ID = "dual_load";

export const DUAL_LOAD_TOOLS = [
  "get_dual_load_dashboard",
  "get_cognitive_readiness_windows",
  "get_exam_collision_forecast",
  "set_academic_priority_period",
  "generate_integrated_weekly_plan",
  "set_academic_stress_level",
] as const;

export type DualLoadToolName = typeof DUAL_LOAD_TOOLS[number];
