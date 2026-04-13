/**
 * Recovery Agent — TypeScript service layer
 *
 * Sprint 1 new agent (all 6 tools are new — none extracted from existing agents).
 * Primary tools live in Python (ai-service/app/agents/tools/recovery_tools.py).
 * This file provides TS-side utilities used by bridge endpoints.
 *
 * Tools: get_recovery_status, get_deload_recommendation, trigger_deload_week,
 *        log_recovery_session, get_tissue_loading_history, flag_injury_concern
 *
 * Bridge endpoints used:
 *   - POST /api/v1/recovery/deload   (trigger_deload_week — NEW)
 *   - POST /api/v1/calendar/events   (log_recovery_session — already exists)
 *   - POST /api/v1/injuries          (flag_injury_concern — already exists)
 *
 * All read tools query Supabase directly from Python (no bridge needed).
 */

export const RECOVERY_AGENT_ID = "recovery";

export const RECOVERY_TOOLS = [
  "get_recovery_status",
  "get_deload_recommendation",
  "trigger_deload_week",
  "log_recovery_session",
  "get_tissue_loading_history",
  "flag_injury_concern",
] as const;

export type RecoveryToolName = typeof RECOVERY_TOOLS[number];
