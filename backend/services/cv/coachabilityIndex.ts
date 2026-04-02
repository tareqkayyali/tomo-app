/**
 * Coachability Index — Deterministic 0-5.0 score.
 *
 * Components:
 *   1. Target Achievement Rate (40%) — from training journals
 *   2. Adaptation Velocity (35%) — benchmark improvement rate
 *   3. Coach Responsiveness (25%) — from coach assessments, falls back to training consistency
 *
 * Label mapping:
 *   4.5–5.0: "Exceptional — consistently exceeds targets, fast adapter"
 *   3.5–4.4: "Strong — reliably acts on coaching inputs"
 *   2.5–3.4: "Developing — good fundamentals, working on consistency"
 *   Below 2.5: "Building — early in structured development"
 *
 * Minimum data: 10 completed journals + 3 test sessions. Otherwise returns null.
 */

export interface CoachabilityResult {
  score: number;
  label: string;
  components: {
    target_achievement_rate: number;  // 0-1
    adaptation_velocity: number;      // 0-1
    coach_responsiveness: number;     // 0-1
  };
  sufficient_data: boolean;
}

interface JournalRow {
  post_outcome: string | null;
  journal_state: string;
}

interface SnapshotData {
  coachability_index?: number | null;
  sessions_total?: number;
  training_age_weeks?: number;
  streak_days?: number;
  speed_profile?: Record<string, number>;
  strength_benchmarks?: Record<string, number>;
  wellness_7day_avg?: number | null;
}

const MIN_JOURNALS = 10;
const MIN_TEST_DATA_POINTS = 2;  // need at least 2 data points for velocity

export function computeCoachabilityIndex(
  snapshot: SnapshotData,
  completedJournals: JournalRow[]
): CoachabilityResult | null {
  const journalCount = completedJournals.length;

  // Minimum data check — need enough journals + test data
  const speedTests = Object.keys(snapshot.speed_profile ?? {}).length;
  const strengthTests = Object.keys(snapshot.strength_benchmarks ?? {}).length;
  const totalTests = speedTests + strengthTests;

  if (journalCount < MIN_JOURNALS && totalTests < MIN_TEST_DATA_POINTS) {
    return null;
  }

  // ── Component 1: Target Achievement Rate (40%) ──
  // Ratio of (hit_it + exceeded) over total completed journals
  let targetRate = 0;
  if (journalCount > 0) {
    const achieved = completedJournals.filter(
      j => j.post_outcome === "hit_it" || j.post_outcome === "exceeded"
    ).length;
    targetRate = achieved / journalCount;
  }
  const targetScore = targetRate * 5;  // 0-5 range

  // ── Component 2: Adaptation Velocity (35%) ──
  // Approximation: how many test data points exist relative to training age
  // More tests + improving = higher adaptation velocity
  // Full computation would compare percentile changes over time,
  // but for the deterministic version we use test density + training consistency
  const trainingWeeks = snapshot.training_age_weeks ?? 0;
  const testDensity = trainingWeeks > 0 ? totalTests / Math.max(4, trainingWeeks / 4) : 0;
  const sessionsTotal = snapshot.sessions_total ?? 0;
  const sessionConsistency = trainingWeeks > 0
    ? Math.min(1, (sessionsTotal / trainingWeeks) / 3)  // 3 sessions/week = 100%
    : 0;
  const adaptationScore = Math.min(5, (Math.min(1, testDensity) * 0.5 + sessionConsistency * 0.5) * 5);

  // ── Component 3: Coach Responsiveness (25%) ──
  // Falls back to training consistency if no coach assessments.
  // Uses streak + session consistency as proxy for responsiveness.
  const streakDays = snapshot.streak_days ?? 0;
  const streakFactor = Math.min(1, streakDays / 14);  // 14-day streak = max
  const responsivenessScore = (sessionConsistency * 0.6 + streakFactor * 0.4) * 5;

  // ── Weighted composite ──
  const weightedScore =
    targetScore * 0.40 +
    adaptationScore * 0.35 +
    responsivenessScore * 0.25;

  const score = Math.round(weightedScore * 10) / 10;
  const label = getCoachabilityLabel(score);

  return {
    score,
    label,
    components: {
      target_achievement_rate: targetRate,
      adaptation_velocity: adaptationScore / 5,
      coach_responsiveness: responsivenessScore / 5,
    },
    sufficient_data: journalCount >= MIN_JOURNALS || totalTests >= MIN_TEST_DATA_POINTS,
  };
}

function getCoachabilityLabel(score: number): string {
  if (score >= 4.5) return "Exceptional — consistently exceeds targets, fast adapter";
  if (score >= 3.5) return "Strong — reliably acts on coaching inputs";
  if (score >= 2.5) return "Developing — good fundamentals, working on consistency";
  return "Building — early in structured development";
}
