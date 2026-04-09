/**
 * Data Confidence Score — Pure function service.
 *
 * Computes a 0–100 score indicating how much we can trust the current snapshot.
 * Drives AI response language:
 * - >= 50: normal operation
 * - < 50: "snapshot may be incomplete, suggest sync/check-in"
 * - < 30: "do not prescribe specific intensity targets"
 *
 * Weights: wearable=0.30, checkin=0.25, session=0.25, subjects=0.20
 *
 * Zero DB access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataFreshnessInput {
  wearable_last_sync_at: Date | null;
  last_checkin_at: Date | null;
  last_session_logged_at: Date | null;
  /** Was there a session today that should have been logged? */
  last_scheduled_session_at: Date | null;
  /** Number of subjects in athlete_subjects table */
  athlete_subjects_count: number;
  asOf: Date;
}

export interface DataConfidenceResult {
  data_confidence_score: number;
  data_confidence_breakdown: {
    wearable: number;
    checkin: number;
    session: number;
    subjects: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHTS = {
  wearable: 0.30,
  checkin: 0.25,
  session: 0.25,
  subjects: 0.20,
};

const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure Function
// ---------------------------------------------------------------------------

function hoursSince(from: Date | null, asOf: Date): number | null {
  if (!from) return null;
  return (asOf.getTime() - from.getTime()) / HOUR_MS;
}

/**
 * Compute the data confidence score from data freshness inputs.
 */
export function computeDataConfidence(input: DataFreshnessInput): DataConfidenceResult {
  const { asOf } = input;

  // ── Wearable factor ──
  const wearableHours = hoursSince(input.wearable_last_sync_at, asOf);
  let wearableFactor: number;
  if (wearableHours === null) {
    wearableFactor = 0;
  } else if (wearableHours <= 24) {
    wearableFactor = 1.0;
  } else if (wearableHours <= 48) {
    wearableFactor = 0.5;
  } else if (wearableHours <= 72) {
    wearableFactor = 0.2;
  } else {
    wearableFactor = 0;
  }

  // ── Check-in factor ──
  const checkinHours = hoursSince(input.last_checkin_at, asOf);
  let checkinFactor: number;
  if (checkinHours === null) {
    checkinFactor = 0;
  } else if (checkinHours <= 24) {
    checkinFactor = 1.0;
  } else if (checkinHours <= 48) {
    checkinFactor = 0.7;
  } else if (checkinHours <= 72) {
    checkinFactor = 0.4;
  } else {
    checkinFactor = 0.1;
  }

  // ── Session factor ──
  // Only scored if a session was expected (scheduled).
  // If no session scheduled, full score (not applicable).
  let sessionFactor: number;
  if (input.last_scheduled_session_at === null) {
    sessionFactor = 1.0; // No session expected — not applicable, full score
  } else {
    const sessionLogged = input.last_session_logged_at !== null
      && input.last_session_logged_at >= input.last_scheduled_session_at;
    sessionFactor = sessionLogged ? 1.0 : 0.3;
  }

  // ── Subjects factor ──
  // Penalise less if 0 subjects — athlete may genuinely have no exams
  const subjectsFactor = input.athlete_subjects_count > 0 ? 1.0 : 0.3;

  // ── Composite ──
  const raw = (wearableFactor * WEIGHTS.wearable)
    + (checkinFactor * WEIGHTS.checkin)
    + (sessionFactor * WEIGHTS.session)
    + (subjectsFactor * WEIGHTS.subjects);

  const score = Math.round(raw * 100);

  return {
    data_confidence_score: Math.min(100, Math.max(0, score)),
    data_confidence_breakdown: {
      wearable: Math.round(wearableFactor * 100) / 100,
      checkin: Math.round(checkinFactor * 100) / 100,
      session: Math.round(sessionFactor * 100) / 100,
      subjects: Math.round(subjectsFactor * 100) / 100,
    },
  };
}
