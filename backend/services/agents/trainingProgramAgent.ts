/**
 * Training Program Agent — TypeScript service layer
 *
 * Sprint 4 — periodization, block training, PHV-safe filtering.
 * Primary tools live in Python (ai-service/app/agents/tools/training_program_tools.py).
 *
 * Tools: get_phv_appropriate_programs, get_periodization_context,
 *        get_position_program_recommendations, get_training_block_history,
 *        create_training_block, update_block_phase, override_session_load
 *
 * Bridge endpoints:
 *   - POST /api/v1/training-program/blocks (NEW)
 *   - PUT  /api/v1/training-program/blocks/:id/phase (NEW)
 *   - PUT  /api/v1/calendar/events/:id/load-override (NEW)
 */

export const TRAINING_PROGRAM_AGENT_ID = "training_program";

export const TRAINING_PROGRAM_TOOLS = [
  "get_phv_appropriate_programs",
  "get_periodization_context",
  "get_position_program_recommendations",
  "get_training_block_history",
  "create_training_block",
  "update_block_phase",
  "override_session_load",
] as const;

export type TrainingProgramToolName = typeof TRAINING_PROGRAM_TOOLS[number];
