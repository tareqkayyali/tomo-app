/**
 * Exam Proximity Scorer — Pure function service.
 *
 * Computes a 0–100 score indicating how close and intense upcoming exams are.
 * Higher score = more academic pressure = more aggressive study scheduling.
 *
 * Formula considers:
 * - Days until nearest exam (exponential decay)
 * - Number of exams in next 14 days
 * - Subject difficulty weighting
 * - Current academic load from snapshot
 *
 * Zero DB access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExamEntry {
  exam_date: string;             // ISO date (YYYY-MM-DD)
  difficulty_rating: number | null; // 1–5
  subject_name: string;
}

export interface ExamProximityInput {
  exams: ExamEntry[];
  /** Current academic load from snapshot (0–100). Used as a boost factor. */
  academicLoad7day: number | null;
  /** Reference date for proximity calculation */
  asOf?: Date;
}

export interface ExamProximityResult {
  exam_proximity_score: number;  // 0–100
  nearest_exam_days: number | null;
  exams_next_14d: number;
  exam_count_active: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days within which exam pressure is at maximum */
const CRITICAL_DAYS = 3;
/** Days beyond which exam pressure is negligible */
const HORIZON_DAYS = 30;
/** Weight of the nearest-exam component */
const NEAREST_WEIGHT = 0.5;
/** Weight of the density component (number of exams in 14d) */
const DENSITY_WEIGHT = 0.3;
/** Weight of the academic load boost */
const LOAD_WEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Pure Function
// ---------------------------------------------------------------------------

/**
 * Compute the exam proximity score.
 *
 * Returns 0 if no upcoming exams.
 * Returns higher values as exams get closer and denser.
 */
export function computeExamProximity(input: ExamProximityInput): ExamProximityResult {
  const { exams, academicLoad7day } = input;
  const now = input.asOf ?? new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Filter to future exams only
  const futureExams = exams.filter(e => e.exam_date >= todayStr);

  if (futureExams.length === 0) {
    return {
      exam_proximity_score: 0,
      nearest_exam_days: null,
      exams_next_14d: 0,
      exam_count_active: 0,
    };
  }

  // ── Nearest exam component ──
  const daysToExams = futureExams.map(e => {
    const examDate = new Date(e.exam_date);
    return Math.max(0, Math.floor((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  });
  const nearestDays = Math.min(...daysToExams);

  // Exponential decay: score = 100 when days <= CRITICAL_DAYS, ~0 at HORIZON_DAYS
  let nearestScore: number;
  if (nearestDays <= CRITICAL_DAYS) {
    nearestScore = 100;
  } else if (nearestDays >= HORIZON_DAYS) {
    nearestScore = 0;
  } else {
    // Exponential decay from 100 to 0 over [CRITICAL_DAYS, HORIZON_DAYS]
    const t = (nearestDays - CRITICAL_DAYS) / (HORIZON_DAYS - CRITICAL_DAYS);
    nearestScore = 100 * Math.exp(-3 * t); // e^-3 ≈ 0.05 at boundary
  }

  // ── Density component (exams in next 14 days) ──
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fourteenStr = fourteenDaysFromNow.toISOString().split('T')[0];
  const examsIn14d = futureExams.filter(e => e.exam_date <= fourteenStr);
  const densityScore = Math.min(100, examsIn14d.length * 25); // 4+ exams = 100

  // Weight by difficulty
  const avgDifficulty = examsIn14d.length > 0
    ? examsIn14d.reduce((sum, e) => sum + (e.difficulty_rating ?? 3), 0) / examsIn14d.length
    : 3;
  const difficultyMultiplier = avgDifficulty / 3; // 1.0 at average, up to 1.67

  // ── Academic load boost ──
  const loadScore = academicLoad7day ?? 0;

  // ── Composite ──
  const raw = (nearestScore * NEAREST_WEIGHT)
    + (densityScore * difficultyMultiplier * DENSITY_WEIGHT)
    + (loadScore * LOAD_WEIGHT);
  const clamped = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    exam_proximity_score: clamped,
    nearest_exam_days: nearestDays,
    exams_next_14d: examsIn14d.length,
    exam_count_active: futureExams.length,
  };
}
