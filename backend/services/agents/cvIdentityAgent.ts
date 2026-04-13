/**
 * CV & Identity Agent — TypeScript service layer
 *
 * Sprint 3 — extends Mastery with 5-layer identity, coachability, CV export.
 * Primary tools live in Python (ai-service/app/agents/tools/cv_identity_tools.py).
 *
 * Tools: get_5_layer_identity, get_coachability_index, get_development_velocity,
 *        set_recruitment_visibility, generate_cv_export, add_verified_achievement
 *
 * Bridge endpoints:
 *   - POST /api/v1/cv/recruitment-visibility (NEW)
 *   - POST /api/v1/cv/achievements (NEW)
 */

export const CV_IDENTITY_AGENT_ID = "cv_identity";

export const CV_IDENTITY_TOOLS = [
  "get_5_layer_identity",
  "get_coachability_index",
  "get_development_velocity",
  "set_recruitment_visibility",
  "generate_cv_export",
  "add_verified_achievement",
] as const;

export type CVIdentityToolName = typeof CV_IDENTITY_TOOLS[number];
