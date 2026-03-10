/**
 * Sensor Test Calculations
 * Pure functions for processing accelerometer/gyroscope data.
 * No side effects — designed for easy unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccelSample {
  x: number;
  y: number;
  z: number;
  timestamp: number; // ms
}

export interface GyroSample {
  x: number; // rad/s
  y: number;
  z: number;
  timestamp: number; // ms
}

export interface JumpResult {
  hangTimeMs: number;
  estimatedHeightCm: number;
  peakAcceleration: number; // in g
}

export interface SprintResult {
  startMs: number;
  endMs: number;
  durationSeconds: number;
  peakAcceleration: number; // in g
  avgAcceleration: number;
}

export interface StabilityResult {
  score: number; // 0-100
  avgDeviation: number; // rad/s
  maxDeviation: number;
  steadyPercent: number; // % of time below steady threshold
}

export interface LateralMovementResult {
  reactionTimeMs: number;
  movementMagnitude: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAVITY = 9.81; // m/s^2
const FREEFALL_THRESHOLD = 0.4; // below this g magnitude = freefall
const LANDING_THRESHOLD = 1.5; // above this g magnitude = landing
const SPRINT_START_THRESHOLD = 1.3; // g magnitude to trigger sprint start
const SPRINT_STOP_THRESHOLD = 0.3; // g deviation from 1.0 to detect stop
const LATERAL_THRESHOLD = 0.5; // g lateral acceleration to detect shuffle
const STABILITY_STEADY_THRESHOLD = 0.1; // rad/s below this = steady
const STABILITY_MAX_THRESHOLD = 0.5; // rad/s max for 100 score

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accelMagnitude(s: AccelSample): number {
  return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
}

function gyroMagnitude(s: GyroSample): number {
  return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
}

// ---------------------------------------------------------------------------
// Jump Height Estimation
// ---------------------------------------------------------------------------

/**
 * Estimates jump height from accelerometer data.
 * Algorithm:
 *   1. Find the freefall phase (magnitude < FREEFALL_THRESHOLD g)
 *   2. Freefall ends when magnitude spikes above LANDING_THRESHOLD g
 *   3. Hang time = duration of freefall
 *   4. Height = 0.5 * g * (hangTime/2)^2
 *
 * AccelSample should contain acceleration WITHOUT gravity (DeviceMotion.acceleration).
 * If using accelerationIncludingGravity, subtract ~9.81 from the magnitude.
 */
export function estimateJumpHeight(
  samples: AccelSample[],
  includesGravity: boolean = false,
): JumpResult | null {
  if (samples.length < 10) return null;

  let takeoffIdx = -1;
  let landingIdx = -1;
  let peakAccel = 0;

  for (let i = 0; i < samples.length; i++) {
    let mag = accelMagnitude(samples[i]);
    if (includesGravity) mag = Math.abs(mag - GRAVITY) / GRAVITY; // normalize to g
    else mag = mag / GRAVITY; // convert m/s^2 to g

    peakAccel = Math.max(peakAccel, mag);

    // Detect freefall start (acceleration drops — the athlete is in the air)
    if (takeoffIdx === -1 && mag < FREEFALL_THRESHOLD) {
      takeoffIdx = i;
    }

    // Detect landing (acceleration spikes — the athlete hits the ground)
    if (takeoffIdx !== -1 && landingIdx === -1 && mag > LANDING_THRESHOLD) {
      landingIdx = i;
      break;
    }
  }

  if (takeoffIdx === -1 || landingIdx === -1) return null;

  const hangTimeMs = samples[landingIdx].timestamp - samples[takeoffIdx].timestamp;
  if (hangTimeMs < 50 || hangTimeMs > 2000) return null; // sanity check

  // Physics: h = 0.5 * g * (t/2)^2 where t is total hang time
  const halfTime = (hangTimeMs / 1000) / 2;
  const heightM = 0.5 * GRAVITY * halfTime * halfTime;
  const heightCm = Math.round(heightM * 100);

  return {
    hangTimeMs: Math.round(hangTimeMs),
    estimatedHeightCm: heightCm,
    peakAcceleration: Math.round(peakAccel * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Sprint Duration Detection
// ---------------------------------------------------------------------------

/**
 * Detects sprint start and end from accelerometer data.
 * Start: magnitude exceeds SPRINT_START_THRESHOLD g
 * End: magnitude stays near 1g for sustained period (deceleration)
 */
export function detectSprintDuration(samples: AccelSample[]): SprintResult | null {
  if (samples.length < 20) return null;

  let startIdx = -1;
  let endIdx = -1;
  let peakAccel = 0;
  let totalAccel = 0;
  let accelCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const mag = accelMagnitude(samples[i]) / GRAVITY;

    // Detect sprint start
    if (startIdx === -1 && mag > SPRINT_START_THRESHOLD) {
      startIdx = i;
    }

    if (startIdx !== -1) {
      peakAccel = Math.max(peakAccel, mag);
      totalAccel += mag;
      accelCount++;

      // Detect sprint end: 5 consecutive samples near 1g
      if (i > startIdx + 10 && Math.abs(mag - 1.0) < SPRINT_STOP_THRESHOLD) {
        let stoppedCount = 0;
        for (let j = i; j < Math.min(i + 5, samples.length); j++) {
          const m = accelMagnitude(samples[j]) / GRAVITY;
          if (Math.abs(m - 1.0) < SPRINT_STOP_THRESHOLD) stoppedCount++;
        }
        if (stoppedCount >= 3) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (startIdx === -1) return null;
  if (endIdx === -1) endIdx = samples.length - 1;

  const durationMs = samples[endIdx].timestamp - samples[startIdx].timestamp;
  if (durationMs < 500) return null; // too short

  return {
    startMs: samples[startIdx].timestamp,
    endMs: samples[endIdx].timestamp,
    durationSeconds: Math.round(durationMs / 10) / 100, // 2 decimal places
    peakAcceleration: Math.round(peakAccel * 100) / 100,
    avgAcceleration: accelCount > 0 ? Math.round((totalAccel / accelCount) * 100) / 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Balance / Stability Score
// ---------------------------------------------------------------------------

/**
 * Calculates stability score from gyroscope data.
 * Lower angular velocity = more stable = higher score.
 */
export function calculateStabilityScore(samples: GyroSample[]): StabilityResult {
  if (samples.length === 0) {
    return { score: 0, avgDeviation: 0, maxDeviation: 0, steadyPercent: 0 };
  }

  let totalDeviation = 0;
  let maxDeviation = 0;
  let steadyCount = 0;

  for (const s of samples) {
    const mag = gyroMagnitude(s);
    totalDeviation += mag;
    maxDeviation = Math.max(maxDeviation, mag);
    if (mag < STABILITY_STEADY_THRESHOLD) steadyCount++;
  }

  const avgDeviation = totalDeviation / samples.length;
  const steadyPercent = Math.round((steadyCount / samples.length) * 100);

  // Score: 100 if avgDeviation = 0, 0 if avgDeviation >= STABILITY_MAX_THRESHOLD
  const score = Math.round(Math.max(0, Math.min(100, 100 * (1 - avgDeviation / STABILITY_MAX_THRESHOLD))));

  return {
    score,
    avgDeviation: Math.round(avgDeviation * 1000) / 1000,
    maxDeviation: Math.round(maxDeviation * 1000) / 1000,
    steadyPercent,
  };
}

// ---------------------------------------------------------------------------
// Lateral Movement Detection
// ---------------------------------------------------------------------------

/**
 * Detects lateral movement from accelerometer x-axis data.
 * Used in agility tests to measure reaction time from cue to movement.
 *
 * @param samples — accelerometer data collected AFTER a cue was given
 * @returns time to first lateral movement and its magnitude
 */
export function detectLateralMovement(samples: AccelSample[]): LateralMovementResult | null {
  if (samples.length < 5) return null;

  const cueTimestamp = samples[0].timestamp;

  for (const s of samples) {
    // x-axis represents lateral movement when phone is held at chest height
    const lateralG = Math.abs(s.x) / GRAVITY;
    if (lateralG > LATERAL_THRESHOLD) {
      return {
        reactionTimeMs: Math.round(s.timestamp - cueTimestamp),
        movementMagnitude: Math.round(lateralG * 100) / 100,
      };
    }
  }

  return null; // no lateral movement detected
}
