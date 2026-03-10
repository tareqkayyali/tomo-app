/**
 * Pose Estimation Service
 *
 * MVP: Generates simulated pose data to demonstrate the full recording flow.
 * PRODUCTION: Replace simulateSession() with real MediaPipe/MoveNet frame processing.
 *
 * The jumpDetection.ts and sprintTimer.ts state machines process PoseFrame
 * objects identically whether they come from simulation or real ML inference.
 */

import type { Keypoint, PoseFrame } from './jumpDetection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestCategory = 'cmj' | 'sprint';

export interface PoseEstimationConfig {
  testCategory: TestCategory;
  durationMs: number;
  fps: number;
}

export interface SimulatedSession {
  frames: PoseFrame[];
  durationMs: number;
  fps: number;
}

// ---------------------------------------------------------------------------
// Test ID → Category mapping
// ---------------------------------------------------------------------------

/**
 * Determine the test category from a testId.
 * IDs containing 'cmj' or 'jump' → 'cmj'
 * Everything else (sprint, shuttle, agility, tap) → 'sprint'
 */
export function getTestCategory(testId: string): TestCategory {
  const id = testId.toLowerCase();
  if (id.includes('cmj') || id.includes('jump')) return 'cmj';
  return 'sprint';
}

/**
 * Get the appropriate recording duration for a test category.
 */
export function getTestDuration(category: TestCategory): number {
  return category === 'cmj' ? 30_000 : 15_000;
}

/**
 * Get the result unit for a test category.
 */
export function getTestUnit(category: TestCategory): string {
  return category === 'cmj' ? 'cm' : 's';
}

// ---------------------------------------------------------------------------
// Frame generation helpers
// ---------------------------------------------------------------------------

/**
 * Generate a full set of keypoints for one frame.
 * Produces the 6 keypoints that jumpDetection and sprintTimer need:
 * left_hip, right_hip, left_knee, right_knee, left_ankle, right_ankle
 */
function generateKeypoints(
  hipX: number,
  hipY: number,
  noise: number,
): Keypoint[] {
  const n = () => (Math.random() - 0.5) * noise * 2;
  const hipSpread = 0.03;

  return [
    { name: 'left_hip', x: hipX - hipSpread + n(), y: hipY + n(), score: 0.85 + Math.random() * 0.15 },
    { name: 'right_hip', x: hipX + hipSpread + n(), y: hipY + n(), score: 0.85 + Math.random() * 0.15 },
    { name: 'left_knee', x: hipX - hipSpread + n(), y: hipY + 0.15 + n(), score: 0.80 + Math.random() * 0.15 },
    { name: 'right_knee', x: hipX + hipSpread + n(), y: hipY + 0.15 + n(), score: 0.80 + Math.random() * 0.15 },
    { name: 'left_ankle', x: hipX - hipSpread + n(), y: hipY + 0.30 + n(), score: 0.75 + Math.random() * 0.15 },
    { name: 'right_ankle', x: hipX + hipSpread + n(), y: hipY + 0.30 + n(), score: 0.75 + Math.random() * 0.15 },
  ];
}

// ---------------------------------------------------------------------------
// CMJ simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a counter-movement jump session.
 * Pattern: calibration → repeated (stand → dip → takeoff → peak → land) cycles
 */
export function simulateCmjSession(config: PoseEstimationConfig): SimulatedSession {
  const { durationMs, fps } = config;
  const totalFrames = Math.floor((durationMs / 1000) * fps);
  const frameInterval = 1000 / fps;
  const frames: PoseFrame[] = [];

  const baselineY = 0.55;
  const baselineX = 0.5;
  const noise = 0.003;
  const jumpHeight = 0.06 + Math.random() * 0.03; // 0.06–0.09 normalized
  const dipDepth = 0.015;
  const jumpCycleFrames = Math.floor(fps * 2.5); // ~2.5s per jump cycle
  const calibrationFrames = 15;

  for (let i = 0; i < totalFrames; i++) {
    const timestamp = i * frameInterval;
    let hipY = baselineY;

    if (i < calibrationFrames) {
      // Calibration: stand still at baseline
      hipY = baselineY + (Math.random() - 0.5) * 0.002;
    } else {
      const cycleFrame = (i - calibrationFrames) % jumpCycleFrames;
      const cycleProgress = cycleFrame / jumpCycleFrames;

      if (cycleProgress < 0.15) {
        // Standing between jumps
        hipY = baselineY;
      } else if (cycleProgress < 0.25) {
        // Dip phase (hip Y increases → moves down in frame)
        const dipProgress = (cycleProgress - 0.15) / 0.10;
        hipY = baselineY + dipDepth * Math.sin(dipProgress * Math.PI);
      } else if (cycleProgress < 0.55) {
        // Jump phase (hip Y decreases → moves up in frame)
        const jumpProgress = (cycleProgress - 0.25) / 0.30;
        hipY = baselineY - jumpHeight * Math.sin(jumpProgress * Math.PI);
      } else if (cycleProgress < 0.65) {
        // Landing absorption
        const landProgress = (cycleProgress - 0.55) / 0.10;
        hipY = baselineY + dipDepth * 0.5 * (1 - landProgress);
      } else {
        // Recovery standing
        hipY = baselineY;
      }
    }

    frames.push({
      keypoints: generateKeypoints(baselineX, hipY, noise),
      timestamp,
    });
  }

  return { frames, durationMs, fps };
}

// ---------------------------------------------------------------------------
// Sprint simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a sprint session.
 * Pattern: calibration → ready (hold still) → sprint (accelerate across frame)
 */
export function simulateSprintSession(config: PoseEstimationConfig): SimulatedSession {
  const { durationMs, fps } = config;
  const totalFrames = Math.floor((durationMs / 1000) * fps);
  const frameInterval = 1000 / fps;
  const frames: PoseFrame[] = [];

  const startX = 0.15;
  const finishX = 0.88;
  const baselineY = 0.50;
  const noise = 0.004;
  const calibrationFrames = 15;
  const readyFrames = Math.floor(fps * 0.5);
  const sprintDurationFrames = Math.floor(fps * (2 + Math.random() * 2)); // 2–4s

  for (let i = 0; i < totalFrames; i++) {
    const timestamp = i * frameInterval;
    let hipX = startX;

    if (i < calibrationFrames) {
      // Calibration: stand still
      hipX = startX + (Math.random() - 0.5) * 0.002;
    } else if (i < calibrationFrames + readyFrames) {
      // Ready phase: slight idle movement
      hipX = startX + (Math.random() - 0.5) * 0.003;
    } else {
      const sprintFrame = i - calibrationFrames - readyFrames;
      if (sprintFrame < sprintDurationFrames) {
        // Sprinting: acceleration + constant speed
        const progress = sprintFrame / sprintDurationFrames;
        const eased =
          progress < 0.3
            ? (progress / 0.3) * (progress / 0.3) // quadratic ease-in
            : 1 - (1 - progress) * 0.15 / 0.7 + 0.85 * progress / (progress + 0.1); // near-linear
        const clamped = Math.min(eased, 1);
        hipX = startX + (finishX - startX) * clamped;
      } else {
        // Past finish line
        hipX = finishX + (Math.random() - 0.5) * 0.005;
      }
    }

    // Slight vertical bobbing during sprint
    const isSprinting = i >= calibrationFrames + readyFrames;
    const bob = isSprinting ? 0.008 * Math.sin(i * 0.5) : 0;

    frames.push({
      keypoints: generateKeypoints(hipX, baselineY + bob, noise),
      timestamp,
    });
  }

  return { frames, durationMs, fps };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a simulated pose estimation session.
 * Returns pre-generated frames that can be fed to jumpDetection or sprintTimer.
 */
export function simulateSession(config: PoseEstimationConfig): SimulatedSession {
  if (config.testCategory === 'cmj') {
    return simulateCmjSession(config);
  }
  return simulateSprintSession(config);
}
