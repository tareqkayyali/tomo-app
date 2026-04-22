-- =========================================================================
-- One-off data cleanup: reject 5 legacy LangSmith-loop fixes (Phase 0)
-- Date: 2026-04-22
-- =========================================================================
-- Rejects 5 low-quality Haiku-generated fixes that existed in ai_fixes
-- before Phase 0 hardened the loop. Not a migration — one-off data repair
-- with full rationale + audit trail. Keyed on hardcoded fix UUIDs from the
-- staging/prod snapshot; safe to run only against a DB with those UUIDs.
--
-- Verdict summary (per enterprise architect review):
--   #1 b6531257: "applied" but never actually committed to code; proposal
--     would have stripped PHV/CCRS/injury_risk from context builder (strict
--     safety regression). False-attribution of applied status.
--   #2 86c307a1: duplicate of #1; return_exceptions=True silently passes
--     exception objects downstream.
--   #3 59aefbc7: violates capsule fast-path architecture (forces tool calls
--     on greeting/smalltalk intents). Detector logic itself is wrong.
--   #4 822643e2: violates RAG ≥0.65 threshold non-negotiable; stale model
--     ID. Underlying rag_empty_chunks issue is real → escalated to
--     needs_human for proper fix.
--   #5 a8b3982b: duplicate of #1/#2; ThreadPoolExecutor+asyncio mixing is
--     wrong pattern.
--
-- Run AFTER migration 00000000000092_auto_heal_phase_0.sql.
-- Idempotent: if fixes are already rejected, UPDATE is a no-op.
-- =========================================================================

BEGIN;

-- Audit entry BEFORE the changes (captures before_state)
INSERT INTO ai_auto_heal_audit (actor, action, target_table, target_id, before_state, reason)
SELECT 'admin:tareq.kayyali@gmail.com',
       'bulk_reject_legacy_fixes',
       'ai_fixes',
       id,
       jsonb_build_object('status', status, 'applied_at', applied_at,
                          'applied_by', applied_by, 'title', title),
       'Phase 0 cleanup of legacy LangSmith loop fixes. See rejection_reason per row.'
FROM ai_fixes
WHERE id IN (
  'b6531257-608f-4e55-b130-6a9fcad1ee45',
  '86c307a1-2464-40a8-8b53-fd159f926456',
  '59aefbc7-4c14-4810-a8a6-04234ffcd7e8',
  '822643e2-9dd4-4c85-b74b-859344c8a70c',
  'a8b3982b-e81d-49bb-90c3-8d1dceb18919'
);

UPDATE ai_fixes SET
  status = 'rejected',
  rationale = 'Rejected Phase 0 cleanup 2026-04-22. Status was "applied" but git log of ai-service/app/graph/nodes/context_assembly.py shows no parallelization commit matching the proposal. The file already uses asyncio.gather for 11+ parallel DB queries (Phase 2 gate <800ms). Proposed code would have replaced a rich AthleteContext builder with a 3-field stub that strips PHV/CCRS/injury_risk/readiness — catastrophic safety regression. admin clicked applied 2026-04-12 09:37 without verification. This is the C3 adversarial-review false-attribution failure.',
  resolved_at = NOW()
WHERE id = 'b6531257-608f-4e55-b130-6a9fcad1ee45';

UPDATE ai_fixes SET
  status = 'rejected',
  rationale = 'Rejected Phase 0 cleanup 2026-04-22. Duplicate of fix b6531257 (same file, same parallelization proposal, same 0.60 confidence). Uses return_exceptions=True which silently passes exception objects downstream, failing type safety. Dedup failure in legacy collector.',
  resolved_at = NOW()
WHERE id = '86c307a1-2464-40a8-8b53-fd159f926456';

UPDATE ai_fixes SET
  status = 'rejected',
  rationale = 'Rejected Phase 0 cleanup 2026-04-22. Forcing fetch_athlete_context on greeting/smalltalk intents violates Tomo capsule fast-path architecture. Greetings are deterministic $0/fast by design; adding mandatory tool calls wastes tokens and latency. Detector logic itself is wrong — greeting without tool calls is correct behavior, not a defect. Also: triple-redundant (conditional tool_choice + _force_tools flag + synthetic tool_call injection).',
  resolved_at = NOW()
WHERE id = '59aefbc7-4c14-4810-a8a6-04234ffcd7e8';

UPDATE ai_fixes SET
  status = 'rejected',
  rationale = 'Rejected Phase 0 cleanup 2026-04-22. Violates Tomo RAG non-negotiable: similarity threshold ≥0.65 (proposal drops to 0.0 as fallback). Also uses outdated model claude-3-5-sonnet-20241022 (current is claude-sonnet-4-6). Adds unbounded Anthropic API call per empty-chunk event. Underlying issue (60% rag_empty_rate) is REAL but requires different approach (better chunking, query expansion via intent classifier, NOT lowered thresholds). Parent issue escalated to needs_human for proper fix.',
  resolved_at = NOW()
WHERE id = '822643e2-9dd4-4c85-b74b-859344c8a70c';

UPDATE ai_fixes SET
  status = 'rejected',
  rationale = 'Rejected Phase 0 cleanup 2026-04-22. Duplicate of fix b6531257 + 86c307a1. ThreadPoolExecutor wrapped in asyncio is wrong pattern — mixing sync thread executors with async I/O adds overhead without benefit. Does not preserve full AthleteContext tree.',
  resolved_at = NOW()
WHERE id = 'a8b3982b-e81d-49bb-90c3-8d1dceb18919';

-- Issue updates
UPDATE ai_issues SET
  status = 'rejected_with_justification',
  rejection_reason = 'Phase 0 cleanup 2026-04-22. latency_spike cluster of 3 duplicate issues (23277bdc/7889c8b6/b62ebb7a) detected same underlying trace anomaly with thin signal (1-3 requests). Dedup failure in collector. File context_assembly.py already uses asyncio.gather for 11+ parallel queries; no real regression detected on manual review.',
  resolved_at = NOW()
WHERE id IN (
  '23277bdc-e93b-41e0-899d-5621afe7690c',
  '7889c8b6-60af-4357-b916-0f6f664a1060',
  'b62ebb7a-6fcf-4ed6-bc79-051ed87066ea'
);

UPDATE ai_issues SET
  status = 'rejected_with_justification',
  rejection_reason = 'Phase 0 cleanup 2026-04-22. Detector counts greeting/smalltalk intents without tool_calls as defects, but Tomo architecture routes these to capsule fast-path with zero tool calls by design. Detector rule needs fix in langsmith_collector.py: exclude greeting/smalltalk/casual intents from zero_tool_response classification.',
  resolved_at = NOW()
WHERE id = '33f4853a-dd5b-4d04-b64e-ccfdeb81c97d';

UPDATE ai_issues SET
  status = 'needs_human',
  escalation_level = 1,
  description = COALESCE(description, pattern_summary) ||
    ' [HUMAN REVIEW ADDED 2026-04-22] Legacy Haiku fix 822643e2 rejected (violated 0.65 threshold non-negotiable, used stale model). Real problem persists: 60% rag_empty_rate with 6 detected entities suggests chunk metadata missing topic/intent_category/sport_specificity/phv_relevance OR query construction bypasses intent classifier. Next action: audit ai-service/app/rag/ for query construction and chunk metadata schema. DO NOT lower similarity threshold below 0.65.'
WHERE id = '3f863170-f6d2-47b3-b1c7-5df97450fe38';

-- Audit entries AFTER the changes
INSERT INTO ai_auto_heal_audit (actor, action, target_table, target_id, after_state, reason)
SELECT 'admin:tareq.kayyali@gmail.com',
       'bulk_reject_legacy_fixes',
       'ai_fixes',
       id,
       jsonb_build_object('status', status, 'resolved_at', resolved_at),
       substring(rationale, 1, 200)
FROM ai_fixes
WHERE id IN (
  'b6531257-608f-4e55-b130-6a9fcad1ee45',
  '86c307a1-2464-40a8-8b53-fd159f926456',
  '59aefbc7-4c14-4810-a8a6-04234ffcd7e8',
  '822643e2-9dd4-4c85-b74b-859344c8a70c',
  'a8b3982b-e81d-49bb-90c3-8d1dceb18919'
);

INSERT INTO ai_auto_heal_audit (actor, action, target_table, target_id, after_state, reason)
SELECT 'admin:tareq.kayyali@gmail.com',
       'bulk_update_issues_post_cleanup',
       'ai_issues',
       id,
       jsonb_build_object('status', status, 'escalation_level', escalation_level),
       substring(COALESCE(rejection_reason, description), 1, 200)
FROM ai_issues
WHERE id IN (
  '23277bdc-e93b-41e0-899d-5621afe7690c',
  '7889c8b6-60af-4357-b916-0f6f664a1060',
  'b62ebb7a-6fcf-4ed6-bc79-051ed87066ea',
  '33f4853a-dd5b-4d04-b64e-ccfdeb81c97d',
  '3f863170-f6d2-47b3-b1c7-5df97450fe38'
);

COMMIT;
