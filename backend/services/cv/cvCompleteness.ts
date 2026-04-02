/**
 * CV Completeness Scoring — separate scores for Club and University CVs.
 *
 * Club CV (100 pts):
 *   Photo (5) + Career (15) + Video (10) + Reference (5) + Statement (10)
 *   + Positions (5) + Physical (15) + Performance (15) + Trajectory (10) + Coachability (10)
 *
 * University CV (100 pts):
 *   Same as Club + Academic (10) + Dual-Role (5) — redistributed weights.
 *
 * Returns both percentages plus a list of next actions to increase completeness.
 */

import type {
  CVIdentity,
  CVPhysicalProfile,
  CVPositions,
  CVStatements,
  CVPerformanceData,
  CVCareerEntry,
  CVAcademicEntry,
  CVMediaLink,
  CVReference,
  CVCharacterTrait,
  CVCompetitionEntry,
} from "./cvAssembler";

export interface CVCompletenessResult {
  club_pct: number;
  uni_pct: number;
  club_breakdown: Record<string, { score: number; max: number; label: string }>;
  uni_breakdown: Record<string, { score: number; max: number; label: string }>;
  next_actions_club: string[];
  next_actions_uni: string[];
}

interface CompletenessInput {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  statements: CVStatements;
  performance: CVPerformanceData;
  career: CVCareerEntry[];
  academic: CVAcademicEntry[];
  media: CVMediaLink[];
  references: CVReference[];
  characterTraits: CVCharacterTrait[];
  competitions: CVCompetitionEntry[];
}

export function computeCVCompleteness(data: CompletenessInput): CVCompletenessResult {
  // ── Club CV Scoring (100 total) ──

  const clubBreakdown: Record<string, { score: number; max: number; label: string }> = {};
  const clubActions: string[] = [];

  // Photo (5)
  const photoScore = data.identity.photo_url ? 5 : 0;
  clubBreakdown.photo = { score: photoScore, max: 5, label: "Profile photo" };
  if (!photoScore) clubActions.push("Add a profile photo — first impression matters");

  // Identity basics (5): nationality + DOB
  const idScore = (data.identity.nationality ? 3 : 0) + (data.identity.date_of_birth ? 2 : 0);
  clubBreakdown.identity = { score: idScore, max: 5, label: "Identity details" };
  if (!data.identity.nationality) clubActions.push("Add your nationality");

  // Physical data (15): height + weight + at least 2 test results
  let physScore = 0;
  if (data.physical.height_cm) physScore += 3;
  if (data.physical.weight_kg) physScore += 3;
  const benchmarkCount = data.performance.benchmarks.length;
  if (benchmarkCount >= 3) physScore += 9;
  else if (benchmarkCount >= 2) physScore += 7;
  else if (benchmarkCount === 1) physScore += 4;
  clubBreakdown.physical = { score: physScore, max: 15, label: "Physical profile" };
  if (benchmarkCount < 2) clubActions.push("Log more physical tests to strengthen your profile");

  // Positions (5)
  let posScore = data.positions.primary_position ? 3 : 0;
  if (data.positions.secondary_positions.length > 0) posScore += 2;
  clubBreakdown.positions = { score: posScore, max: 5, label: "Playing positions" };
  if (data.positions.secondary_positions.length === 0) clubActions.push("Add secondary positions");

  // Career history (15): at least one entry
  const careerScore = data.career.length > 0 ? 15 : 0;
  clubBreakdown.career = { score: careerScore, max: 15, label: "Career history" };
  if (!careerScore) clubActions.push("Add your club or academy history");

  // Personal statement (10): approved = 10, draft = 5
  const stmtScore = data.statements.statement_status === "approved" ? 10
    : data.statements.personal_statement_club ? 5 : 0;
  clubBreakdown.statement = { score: stmtScore, max: 10, label: "Personal statement" };
  if (stmtScore < 10) {
    if (data.statements.personal_statement_club) {
      clubActions.push("Review and approve your AI-drafted personal statement");
    } else {
      clubActions.push("Generate your AI personal statement");
    }
  }

  // Performance data (15): sessions + training age + coachability
  let perfScore = 0;
  if (data.performance.sessions_total >= 20) perfScore += 5;
  else if (data.performance.sessions_total >= 10) perfScore += 3;
  if (data.performance.training_age_weeks >= 8) perfScore += 5;
  else if (data.performance.training_age_weeks >= 4) perfScore += 3;
  if (data.performance.coachability) perfScore += 5;
  clubBreakdown.performance = { score: perfScore, max: 15, label: "Training performance" };

  // Trajectory (5)
  const trajScore = benchmarkCount >= 2 ? 5 : benchmarkCount === 1 ? 2 : 0;
  clubBreakdown.trajectory = { score: trajScore, max: 5, label: "Development trajectory" };

  // Video & media (10)
  const videoScore = data.media.length > 0 ? 10 : 0;
  clubBreakdown.video = { score: videoScore, max: 10, label: "Video & media" };
  if (!videoScore) clubActions.push("Add a highlight video — CVs with video get 4x more scout views");

  // References (5)
  const consentedRefs = data.references.filter(r => r.consent_given).length;
  const refScore = consentedRefs > 0 ? 5 : 0;
  clubBreakdown.references = { score: refScore, max: 5, label: "Coach references" };
  if (!refScore) clubActions.push("Add a coach reference");

  // Character/awards (5)
  const charScore = data.characterTraits.length > 0 ? 5 : 0;
  clubBreakdown.character = { score: charScore, max: 5, label: "Awards & character" };

  // Competitions (5)
  const compScore = data.competitions.length > 0 ? 5 : 0;
  clubBreakdown.competitions = { score: compScore, max: 5, label: "Competition record" };

  const clubTotal = Object.values(clubBreakdown).reduce((sum, s) => sum + s.score, 0);
  const clubMax = Object.values(clubBreakdown).reduce((sum, s) => sum + s.max, 0);
  const clubPct = clubMax > 0 ? Math.round((clubTotal / clubMax) * 100) : 0;

  // ── University CV Scoring (same + academic + dual-role) ──

  const uniBreakdown = { ...clubBreakdown };
  const uniActions = [...clubActions];

  // Academic (10)
  const academicScore = data.academic.length > 0
    ? (data.academic.some(a => a.gpa) ? 10 : 7)
    : 0;
  uniBreakdown.academic = { score: academicScore, max: 10, label: "Academic record" };
  if (!academicScore) uniActions.push("Add your school or university details — required for university CVs");

  // Dual-role (5)
  const dualScore = data.performance.sessions_total >= 10 ? 5 : 0;
  uniBreakdown.dual_role = { score: dualScore, max: 5, label: "Dual-role competency" };

  const uniTotal = Object.values(uniBreakdown).reduce((sum, s) => sum + s.score, 0);
  const uniMax = Object.values(uniBreakdown).reduce((sum, s) => sum + s.max, 0);
  const uniPct = uniMax > 0 ? Math.round((uniTotal / uniMax) * 100) : 0;

  return {
    club_pct: clubPct,
    uni_pct: uniPct,
    club_breakdown: clubBreakdown,
    uni_breakdown: uniBreakdown,
    next_actions_club: clubActions.slice(0, 3),  // top 3 most impactful
    next_actions_uni: uniActions.slice(0, 3),
  };
}
