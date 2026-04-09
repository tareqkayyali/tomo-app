/**
 * Planning Context Builder — Assembles the PlanningContext from snapshot + mode + protocols.
 *
 * This is the planning engine's context builder (distinct from the AI agent context builder).
 * It combines snapshot state, mode parameters, applicable protocols, and cognitive windows
 * into a single context object that the plan generators consume.
 *
 * Zero DB access — all inputs are passed in.
 */

import type { ModeParams } from '../scheduling/modeConfig';
import type { PlanningProtocol } from './planningProtocolSelector';
import type { DualLoadResult } from './dualLoadIndex';
import type { ExamProximityResult } from './examProximityScorer';
import type { CognitiveWindowDefinition } from './cognitiveWindowEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotState {
  readiness_rag: string | null;
  readiness_score: number | null;
  acwr: number | null;
  academic_load_7day: number | null;
  athletic_load_7day: number | null;
  sleep_quality: number | null;
  injury_risk_flag: string | null;
  phv_stage: string | null;
  wellness_trend: string | null;
  training_monotony: number | null;
  training_strain: number | null;
  data_confidence_score: number | null;
  season_phase: string | null;
  sleep_debt_3d: number | null;
  body_feel_trend_7d: number | null;
  matches_next_7d: number | null;
  exams_next_14d: number | null;
}

export interface PlanningContext {
  // Mode
  modeId: string;
  modeParams: ModeParams;
  balanceRatio: number;

  // Load state
  dualLoad: DualLoadResult;
  examProximity: ExamProximityResult;

  // Protocols
  mandatoryProtocols: PlanningProtocol[];
  advisoryProtocols: PlanningProtocol[];
  allProtocolIds: string[];

  // Cognitive
  cognitiveWindows: CognitiveWindowDefinition[];

  // Snapshot-derived constraints
  constraints: PlanningConstraints;

  // Data quality
  dataConfidenceScore: number | null;
}

export interface PlanningConstraints {
  maxHardPerWeek: number;
  maxSessionsPerDay: number;
  loadCapMultiplier: number;
  intensityCapOnExamDays: string | null;
  blockedSessionTypes: string[];
  requiredElements: string[];
  isRedReadiness: boolean;
  isInjured: boolean;
  isCiraPHV: boolean;
  highMonotony: boolean;
  highSleepDebt: boolean;
  matchesAhead: number;
}

// ---------------------------------------------------------------------------
// Pure Function
// ---------------------------------------------------------------------------

/**
 * Build the full planning context from all inputs.
 */
export function buildPlanningContext(params: {
  modeId: string;
  modeParams: ModeParams;
  snapshot: SnapshotState;
  dualLoad: DualLoadResult;
  examProximity: ExamProximityResult;
  mandatoryProtocols: PlanningProtocol[];
  advisoryProtocols: PlanningProtocol[];
  allProtocolIds: string[];
  cognitiveWindows: CognitiveWindowDefinition[];
}): PlanningContext {
  const {
    modeId, modeParams, snapshot, dualLoad, examProximity,
    mandatoryProtocols, advisoryProtocols, allProtocolIds, cognitiveWindows,
  } = params;

  // ── Aggregate blocked session types from MANDATORY protocols ──
  const blockedSessionTypes = new Set<string>();
  const requiredElements = new Set<string>();

  for (const protocol of mandatoryProtocols) {
    const actions = protocol.actions as Record<string, unknown>;
    if (Array.isArray(actions.block_session_types)) {
      (actions.block_session_types as string[]).forEach(t => blockedSessionTypes.add(t));
    }
    if (Array.isArray(actions.required_elements)) {
      (actions.required_elements as string[]).forEach(e => requiredElements.add(e));
    }
  }

  // ── Build constraints from mode + snapshot + protocols ──
  const constraints: PlanningConstraints = {
    maxHardPerWeek: modeParams.maxHardPerWeek,
    maxSessionsPerDay: modeParams.maxSessionsPerDay,
    loadCapMultiplier: modeParams.loadCapMultiplier,
    intensityCapOnExamDays: modeParams.intensityCapOnExamDays,
    blockedSessionTypes: Array.from(blockedSessionTypes),
    requiredElements: Array.from(requiredElements),
    isRedReadiness: snapshot.readiness_rag === 'RED',
    isInjured: snapshot.injury_risk_flag === 'RED',
    isCiraPHV: snapshot.phv_stage === 'CIRCA',
    highMonotony: (snapshot.training_monotony ?? 0) > 2.0,
    highSleepDebt: (snapshot.sleep_debt_3d ?? 0) > 6,
    matchesAhead: snapshot.matches_next_7d ?? 0,
  };

  return {
    modeId,
    modeParams,
    balanceRatio: modeParams.studyTrainingBalanceRatio,
    dualLoad,
    examProximity,
    mandatoryProtocols,
    advisoryProtocols,
    allProtocolIds,
    cognitiveWindows,
    constraints,
    dataConfidenceScore: snapshot.data_confidence_score,
  };
}
