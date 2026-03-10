/**
 * Sprint Timer Service
 *
 * Pure, testable logic for camera-based sprint timing via pose estimation.
 * Designed for side-on camera placement (phone on ground or held still).
 *
 * RECOMMENDED SETUP (React Native):
 *   Primary  — react-native-mediapipe + BlazePose LITE  (33 keypoints, 30+ FPS)
 *   Fallback — @tensorflow-models/pose-detection + MoveNet Lightning (17 keypoints)
 *
 * HOW IT WORKS:
 *   1. Calibration — first N frames establish baseline hip X position
 *   2. Ready       — athlete holds still, system waits for movement
 *   3. Start       — first significant horizontal displacement triggers timer
 *   4. Sprint      — track displacement from start; direction auto-detected
 *   5. Finish      — hip crosses displacement threshold → stop timer
 *
 * COORDINATE SYSTEM:
 *   Normalized 0–1, X = 0 at left of frame, X = 1 at right.
 *   Sprinting left-to-right: hip X increases.
 *   Sprinting right-to-left: hip X decreases.
 *
 * MODULAR DESIGN:
 *   Reuses computeBaseline from jumpDetection for calibration.
 *   Feeds into explosiveness score and archetype refinement.
 */

import { computeBaseline, type Keypoint, type PoseFrame } from './jumpDetection';
export type { Keypoint, PoseFrame };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SprintPhase = 'calibrating' | 'ready' | 'sprinting' | 'finished';

export interface SprintConfig {
  minConfidence: number;                // keypoint confidence threshold
  calibrationFrames: number;            // frames to establish starting position
  startDisplacementThreshold: number;   // per-frame hip X change to trigger start
  finishDisplacementThreshold: number;  // total X displacement from start to finish
  minSprintTimeMs: number;              // below this → "too fast" warning
  maxSprintTimeMs: number;              // above this → auto-finish + timeout warning
  fpsWarningThreshold: number;          // warn if avg FPS drops below this
  consecutiveLostFramesWarning: number; // warn if tracking lost for this many frames
}

export interface SprintDetectorState {
  phase: SprintPhase;
  calibrationBuffer: number[];
  startingX: number | null;
  sprintDirection: number;         // +1 (left-to-right) or -1 (right-to-left)
  startTimestamp: number;
  endTimestamp: number;
  startFrame: number;
  endFrame: number;
  frameCount: number;
  firstFrameTimestamp: number | null;
  lastFrameTimestamp: number;
  lastHipX: number | null;
  peakFrameDisplacement: number;
  consecutiveLostFrames: number;
  maxConsecutiveLostFrames: number;
  timedOut: boolean;
}

export interface SprintResult {
  timeInSeconds: number;
  startFrame: number;
  endFrame: number;
  notes: string;
  warnings: string[];
  avgFps: number;
  peakVelocity: number;   // normalized units per second
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_SPRINT_CONFIG: SprintConfig = {
  minConfidence: 0.5,
  calibrationFrames: 15,
  startDisplacementThreshold: 0.008,   // ~0.8% of frame width per frame
  finishDisplacementThreshold: 0.70,   // 70% of frame width
  minSprintTimeMs: 500,                // 0.5 s minimum
  maxSprintTimeMs: 15_000,             // 15 s maximum
  fpsWarningThreshold: 15,
  consecutiveLostFramesWarning: 5,
};

const HIP_NAMES = ['left_hip', 'right_hip'];

// ---------------------------------------------------------------------------
// Keypoint extraction (X-axis — complements jumpDetection's Y-axis utils)
// ---------------------------------------------------------------------------

/**
 * Average X of the named keypoints that meet the confidence threshold.
 * Returns null if none qualify.
 */
export function extractMidpointX(
  keypoints: Keypoint[],
  names: string[],
  minConfidence: number,
): number | null {
  const matching = keypoints.filter(
    (kp) => names.includes(kp.name) && kp.score >= minConfidence,
  );
  if (matching.length === 0) return null;
  return matching.reduce((sum, kp) => sum + kp.x, 0) / matching.length;
}

/** Average X of left_hip and right_hip. */
export function extractHipX(
  keypoints: Keypoint[],
  minConfidence: number,
): number | null {
  return extractMidpointX(keypoints, HIP_NAMES, minConfidence);
}

// ---------------------------------------------------------------------------
// FPS computation
// ---------------------------------------------------------------------------

/**
 * Average FPS from total frame count and time span.
 */
export function computeAvgFps(
  frameCount: number,
  firstTimestamp: number,
  lastTimestamp: number,
): number {
  const durationMs = lastTimestamp - firstTimestamp;
  if (durationMs <= 0 || frameCount < 2) return 0;
  return Math.round(((frameCount - 1) / (durationMs / 1000)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Direction label
// ---------------------------------------------------------------------------

export function getDirectionLabel(direction: number): string {
  return direction > 0 ? 'left-to-right' : 'right-to-left';
}

// ---------------------------------------------------------------------------
// Speed estimation
// ---------------------------------------------------------------------------

/**
 * Convert normalized peak velocity to approximate meters per second.
 *
 * @param peakVelocity       — normalized units per second
 * @param fieldOfViewMeters  — real-world width visible in camera (default 7 m)
 */
export function estimateSpeedMps(
  peakVelocity: number,
  fieldOfViewMeters: number = 7,
): number {
  return Math.round(peakVelocity * fieldOfViewMeters * 100) / 100;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export function createSprintState(): SprintDetectorState {
  return {
    phase: 'calibrating',
    calibrationBuffer: [],
    startingX: null,
    sprintDirection: 0,
    startTimestamp: 0,
    endTimestamp: 0,
    startFrame: 0,
    endFrame: 0,
    frameCount: 0,
    firstFrameTimestamp: null,
    lastFrameTimestamp: 0,
    lastHipX: null,
    peakFrameDisplacement: 0,
    consecutiveLostFrames: 0,
    maxConsecutiveLostFrames: 0,
    timedOut: false,
  };
}

/**
 * Process a single pose frame and return the next detector state.
 *
 * Pure function — does not mutate the input state.
 * Call once per camera frame (~30 FPS).
 */
export function processSprintFrame(
  state: SprintDetectorState,
  frame: PoseFrame,
  config: SprintConfig = DEFAULT_SPRINT_CONFIG,
): SprintDetectorState {
  const next: SprintDetectorState = {
    ...state,
    frameCount: state.frameCount + 1,
    lastFrameTimestamp: frame.timestamp,
  };

  if (state.firstFrameTimestamp === null) {
    next.firstFrameTimestamp = frame.timestamp;
  }

  const hipX = extractHipX(frame.keypoints, config.minConfidence);

  // Skip low-confidence frames — track lost frames during sprint
  if (hipX === null) {
    if (state.phase === 'sprinting') {
      next.consecutiveLostFrames = state.consecutiveLostFrames + 1;
      if (next.consecutiveLostFrames > state.maxConsecutiveLostFrames) {
        next.maxConsecutiveLostFrames = next.consecutiveLostFrames;
      }
    }
    return next;
  }

  next.consecutiveLostFrames = 0;

  // ---- Calibrating ----
  if (next.phase === 'calibrating') {
    next.calibrationBuffer = [...state.calibrationBuffer, hipX];
    if (next.calibrationBuffer.length >= config.calibrationFrames) {
      next.startingX = computeBaseline(next.calibrationBuffer);
      next.phase = 'ready';
    }
    next.lastHipX = hipX;
    return next;
  }

  // ---- Ready (waiting for movement) ----
  if (next.phase === 'ready') {
    if (state.lastHipX !== null) {
      const dx = hipX - state.lastHipX;
      if (Math.abs(dx) > config.startDisplacementThreshold) {
        next.phase = 'sprinting';
        next.startTimestamp = frame.timestamp;
        next.startFrame = next.frameCount;
        next.sprintDirection = dx > 0 ? 1 : -1;
      }
    }
    next.lastHipX = hipX;
    return next;
  }

  // ---- Sprinting ----
  if (next.phase === 'sprinting') {
    // Track peak per-frame displacement
    if (state.lastHipX !== null) {
      const frameDx = Math.abs(hipX - state.lastHipX);
      if (frameDx > state.peakFrameDisplacement) {
        next.peakFrameDisplacement = frameDx;
      }
    }

    // Check finish: displacement from start in sprint direction
    const totalDisplacement = (hipX - next.startingX!) * next.sprintDirection;

    if (totalDisplacement >= config.finishDisplacementThreshold) {
      next.phase = 'finished';
      next.endTimestamp = frame.timestamp;
      next.endFrame = next.frameCount;
    }

    // Timeout (only if not already finished)
    if (next.phase !== 'finished') {
      const elapsed = frame.timestamp - next.startTimestamp;
      if (elapsed > config.maxSprintTimeMs) {
        next.phase = 'finished';
        next.endTimestamp = frame.timestamp;
        next.endFrame = next.frameCount;
        next.timedOut = true;
      }
    }

    next.lastHipX = hipX;
    return next;
  }

  // ---- Finished (no further processing) ----
  return next;
}

// ---------------------------------------------------------------------------
// Session result computation
// ---------------------------------------------------------------------------

/**
 * Compute final sprint result from the detector state.
 */
export function getSprintResult(
  state: SprintDetectorState,
  config: SprintConfig = DEFAULT_SPRINT_CONFIG,
): SprintResult {
  const warnings: string[] = [];

  // ---- Time ----
  let timeInSeconds = 0;
  if (state.phase === 'finished' && state.endTimestamp > state.startTimestamp) {
    timeInSeconds =
      Math.round(((state.endTimestamp - state.startTimestamp) / 1000) * 1000) / 1000;
  }

  // ---- FPS ----
  const avgFps =
    state.firstFrameTimestamp !== null
      ? computeAvgFps(
          state.frameCount,
          state.firstFrameTimestamp,
          state.lastFrameTimestamp,
        )
      : 0;

  // ---- Peak velocity (normalized units per second) ----
  const peakVelocity =
    avgFps > 0
      ? Math.round(state.peakFrameDisplacement * avgFps * 1000) / 1000
      : 0;

  // ---- Warnings ----

  if (avgFps > 0 && avgFps < config.fpsWarningThreshold) {
    warnings.push(
      `Frame rate averaged ${avgFps} FPS (below ${config.fpsWarningThreshold}). Timing may be less accurate.`,
    );
  }

  if (state.maxConsecutiveLostFrames >= config.consecutiveLostFramesWarning) {
    warnings.push(
      'Tracking was lost during the sprint. Ensure full body stays in frame.',
    );
  }

  if (
    state.phase === 'finished' &&
    timeInSeconds > 0 &&
    timeInSeconds < config.minSprintTimeMs / 1000
  ) {
    warnings.push(
      'Sprint time seems too fast. Hold still before starting, then sprint.',
    );
  }

  if (state.timedOut) {
    warnings.push(
      'Sprint exceeded maximum time. Try positioning the camera to capture the full distance.',
    );
  }

  if (state.phase === 'sprinting') {
    warnings.push(
      'Sprint was not completed. Make sure you cross the full field of view.',
    );
  }

  if (state.phase === 'calibrating') {
    warnings.push(
      'Calibration incomplete. Stand still and ensure full body is visible.',
    );
  }

  // ---- Notes ----
  let notes: string;

  if (state.phase === 'finished' && timeInSeconds > 0) {
    const dir = getDirectionLabel(state.sprintDirection);
    notes = `Sprint completed: ${timeInSeconds}s (${dir}). ${avgFps} FPS avg.`;
  } else if (state.phase === 'sprinting') {
    notes = 'Sprint was not completed within the capture window.';
  } else if (state.phase === 'ready') {
    notes = 'No sprint detected. Stand still, then sprint across the frame.';
  } else {
    notes = 'Calibration incomplete. Ensure full body is visible and stand still.';
  }

  return {
    timeInSeconds,
    startFrame: state.startFrame,
    endFrame: state.endFrame,
    notes,
    warnings,
    avgFps,
    peakVelocity,
  };
}
