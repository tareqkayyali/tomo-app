/**
 * Jump Detection Service
 *
 * Pure, testable logic for real-time jump counting via pose estimation.
 * Designed for use with MediaPipe BlazePose or MoveNet keypoints.
 *
 * RECOMMENDED SETUP (React Native):
 *   Primary  — react-native-mediapipe + BlazePose LITE  (33 keypoints, 30+ FPS)
 *   Fallback — @tensorflow-models/pose-detection + MoveNet Lightning (17 keypoints)
 *
 * Both models provide the keypoints this service needs:
 *   left_hip, right_hip, left_knee, right_knee, left_ankle, right_ankle
 *
 * HOW IT WORKS:
 *   1. Calibration — first N frames establish a baseline hip Y position
 *   2. Takeoff     — hip rises above baseline by jumpThreshold → airborne
 *   3. Landing     — hip returns within landThreshold of baseline → count jump
 *   4. Cooldown    — minimum ms gap between jumps prevents double-counting
 *
 * COORDINATE SYSTEM:
 *   Normalized 0–1, Y = 0 at top of frame, Y = 1 at bottom.
 *   Jumping UP means hip Y DECREASES.
 *
 * MODULAR DESIGN:
 *   Keypoint extraction and baseline calibration are generic utilities
 *   reusable for sprint timing, agility tests, and other movement analysis.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Keypoint {
  name: string;
  x: number;     // normalized 0–1
  y: number;     // normalized 0–1, 0 = top of frame
  score: number; // confidence 0–1
}

export interface PoseFrame {
  keypoints: Keypoint[];
  timestamp: number; // ms since session start
}

export type JumpPhase = 'calibrating' | 'grounded' | 'airborne';

export interface JumpEvent {
  jumpNumber: number;
  timestamp: number;        // ms — when landing detected
  takeoffTimestamp: number;  // ms — when takeoff detected
  peakDisplacement: number;  // normalized distance above baseline
  duration: number;          // ms from takeoff to landing
}

export interface JumpConfig {
  jumpThreshold: number;     // displacement to trigger takeoff  (default 0.04)
  landThreshold: number;     // displacement to trigger landing  (default 0.015)
  minConfidence: number;     // minimum keypoint confidence       (default 0.5)
  calibrationFrames: number; // frames to build baseline          (default 15)
  cooldownMs: number;        // minimum ms between jumps          (default 200)
  lowJumpThreshold: number;  // below this → "low jump" warning   (default 0.06)
  sessionDurationMs: number; // total session length               (default 30000)
}

export interface JumpDetectorState {
  phase: JumpPhase;
  baseline: number | null;
  calibrationBuffer: number[];
  currentPeakDisplacement: number;
  takeoffTimestamp: number;
  lastLandingTimestamp: number;
  jumps: JumpEvent[];
  frameCount: number;
}

export interface JumpSessionResult {
  totalJumps: number;
  avgPace: number;         // avg seconds between jumps (0 if < 2 jumps)
  repsPer10Sec: number;    // jumps per 10-second window
  jumps: JumpEvent[];
  warnings: string[];
  rawKeypoints: Keypoint[][];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: JumpConfig = {
  jumpThreshold: 0.04,
  landThreshold: 0.015,
  minConfidence: 0.5,
  calibrationFrames: 15,
  cooldownMs: 200,
  lowJumpThreshold: 0.06,
  sessionDurationMs: 30_000,
};

const HIP_NAMES = ['left_hip', 'right_hip'];
const ANKLE_NAMES = ['left_ankle', 'right_ankle'];

// ---------------------------------------------------------------------------
// Keypoint extraction (generic — reusable for other movement services)
// ---------------------------------------------------------------------------

/**
 * Average Y of the named keypoints that meet the confidence threshold.
 * Returns null if none qualify.
 */
export function extractMidpointY(
  keypoints: Keypoint[],
  names: string[],
  minConfidence: number,
): number | null {
  const matching = keypoints.filter(
    (kp) => names.includes(kp.name) && kp.score >= minConfidence,
  );
  if (matching.length === 0) return null;
  return matching.reduce((sum, kp) => sum + kp.y, 0) / matching.length;
}

/** Average Y of left_hip and right_hip. */
export function extractHipY(
  keypoints: Keypoint[],
  minConfidence: number,
): number | null {
  return extractMidpointY(keypoints, HIP_NAMES, minConfidence);
}

/** Average Y of left_ankle and right_ankle. */
export function extractAnkleY(
  keypoints: Keypoint[],
  minConfidence: number,
): number | null {
  return extractMidpointY(keypoints, ANKLE_NAMES, minConfidence);
}

// ---------------------------------------------------------------------------
// Baseline calibration
// ---------------------------------------------------------------------------

/**
 * Compute a robust baseline from a buffer of Y values.
 * Uses the median to resist outlier frames.
 */
export function computeBaseline(buffer: number[]): number {
  if (buffer.length === 0) return 0;
  const sorted = [...buffer].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// Displacement
// ---------------------------------------------------------------------------

/**
 * Vertical displacement from baseline.
 * Positive = jumping up (hip Y decreased relative to baseline).
 */
export function computeDisplacement(
  baseline: number,
  currentY: number,
): number {
  return baseline - currentY;
}

// ---------------------------------------------------------------------------
// Jump height estimation
// ---------------------------------------------------------------------------

/**
 * Convert normalized peak displacement to approximate centimeters.
 *
 * @param peakDisplacement — normalized (0–1) hip rise above baseline
 * @param visibleHeightCm  — real-world height visible in the camera frame.
 *   Default 200 cm assumes a full-body view (~2 m tall person).
 *   For better accuracy, calibrate with a known reference height.
 */
export function estimateJumpHeightCm(
  peakDisplacement: number,
  visibleHeightCm: number = 200,
): number {
  return Math.round(peakDisplacement * visibleHeightCm * 10) / 10;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export function createInitialState(): JumpDetectorState {
  return {
    phase: 'calibrating',
    baseline: null,
    calibrationBuffer: [],
    currentPeakDisplacement: 0,
    takeoffTimestamp: 0,
    lastLandingTimestamp: 0,
    jumps: [],
    frameCount: 0,
  };
}

/**
 * Process a single pose frame and return the next detector state.
 *
 * Pure function — does not mutate the input state.
 * Call once per camera frame (~30 FPS).
 */
export function processFrame(
  state: JumpDetectorState,
  frame: PoseFrame,
  config: JumpConfig = DEFAULT_CONFIG,
): JumpDetectorState {
  const next: JumpDetectorState = {
    ...state,
    frameCount: state.frameCount + 1,
  };

  const hipY = extractHipY(frame.keypoints, config.minConfidence);

  // Skip frame if keypoints not confident enough
  if (hipY === null) return next;

  // ---- Calibration phase ----
  if (next.phase === 'calibrating') {
    next.calibrationBuffer = [...state.calibrationBuffer, hipY];
    if (next.calibrationBuffer.length >= config.calibrationFrames) {
      next.baseline = computeBaseline(next.calibrationBuffer);
      next.phase = 'grounded';
    }
    return next;
  }

  const baseline = next.baseline!;
  const displacement = computeDisplacement(baseline, hipY);

  // ---- Grounded phase ----
  if (next.phase === 'grounded') {
    if (displacement > config.jumpThreshold) {
      next.phase = 'airborne';
      next.takeoffTimestamp = frame.timestamp;
      next.currentPeakDisplacement = displacement;
    }
    return next;
  }

  // ---- Airborne phase ----
  if (next.phase === 'airborne') {
    // Track peak height
    if (displacement > state.currentPeakDisplacement) {
      next.currentPeakDisplacement = displacement;
    }

    // Check for landing
    if (displacement < config.landThreshold) {
      const timeSinceLast = frame.timestamp - state.lastLandingTimestamp;

      if (state.jumps.length === 0 || timeSinceLast >= config.cooldownMs) {
        const event: JumpEvent = {
          jumpNumber: state.jumps.length + 1,
          timestamp: frame.timestamp,
          takeoffTimestamp: next.takeoffTimestamp,
          peakDisplacement: next.currentPeakDisplacement,
          duration: frame.timestamp - next.takeoffTimestamp,
        };
        next.jumps = [...state.jumps, event];
        next.lastLandingTimestamp = frame.timestamp;
      }

      next.phase = 'grounded';
      next.currentPeakDisplacement = 0;
    }

    return next;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Session result computation
// ---------------------------------------------------------------------------

/**
 * Compute final session stats from the detector state.
 *
 * @param state             — final detector state after all frames
 * @param sessionDurationMs — actual session duration in ms
 * @param config            — config for warning thresholds
 * @param rawKeypoints      — optional accumulated keypoints for export
 */
export function getSessionResult(
  state: JumpDetectorState,
  sessionDurationMs: number,
  config: JumpConfig = DEFAULT_CONFIG,
  rawKeypoints: Keypoint[][] = [],
): JumpSessionResult {
  const { jumps } = state;
  const totalJumps = jumps.length;

  // -- Average pace (seconds between consecutive jumps) --
  let avgPace = 0;
  if (totalJumps >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < jumps.length; i++) {
      intervals.push(jumps[i].timestamp - jumps[i - 1].timestamp);
    }
    const total = intervals.reduce((a, b) => a + b, 0);
    avgPace = Math.round((total / intervals.length / 1000) * 100) / 100;
  }

  // -- Reps per 10 seconds --
  const durationSec = sessionDurationMs / 1000;
  const repsPer10Sec =
    durationSec > 0
      ? Math.round((totalJumps / durationSec) * 10 * 100) / 100
      : 0;

  // -- Warnings --
  const warnings: string[] = [];

  // Low jump height
  const lowJumps = jumps.filter(
    (j) => j.peakDisplacement < config.lowJumpThreshold,
  );
  if (lowJumps.length > 0) {
    const s = lowJumps.length === 1 ? '' : 's';
    warnings.push(
      `${lowJumps.length} jump${s} had low height. Focus on driving through your legs.`,
    );
  }

  // Pacing inconsistency (coefficient of variation > 0.4)
  if (totalJumps >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < jumps.length; i++) {
      intervals.push(jumps[i].timestamp - jumps[i - 1].timestamp);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv > 0.4) {
      warnings.push(
        'Pacing is inconsistent. Try to keep a steady rhythm.',
      );
    }
  }

  // No jumps detected
  if (totalJumps === 0 && state.phase !== 'calibrating') {
    warnings.push(
      'No jumps detected. Make sure your full body is visible.',
    );
  }

  return {
    totalJumps,
    avgPace,
    repsPer10Sec,
    jumps,
    warnings,
    rawKeypoints,
  };
}
