/**
 * Tests for Jump Detection Service
 * Validates keypoint extraction, baseline calibration, jump phase detection,
 * session stats, form warnings, and edge cases.
 *
 * No React Native dependencies — imports directly from the service.
 */

import {
  type Keypoint,
  type PoseFrame,
  type JumpConfig,
  type JumpDetectorState,
  DEFAULT_CONFIG,
  extractMidpointY,
  extractHipY,
  extractAnkleY,
  computeBaseline,
  computeDisplacement,
  estimateJumpHeightCm,
  createInitialState,
  processFrame,
  getSessionResult,
} from '../jumpDetection';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Test helpers — frame generators
// ---------------------------------------------------------------------------

/** Build a PoseFrame with both hips and ankles at specified Y. */
function makeFrame(
  hipY: number,
  timestamp: number,
  confidence: number = 0.9,
): PoseFrame {
  return {
    keypoints: [
      { name: 'left_hip', x: 0.45, y: hipY, score: confidence },
      { name: 'right_hip', x: 0.55, y: hipY, score: confidence },
      { name: 'left_knee', x: 0.45, y: hipY + 0.15, score: confidence },
      { name: 'right_knee', x: 0.55, y: hipY + 0.15, score: confidence },
      { name: 'left_ankle', x: 0.45, y: hipY + 0.30, score: confidence },
      { name: 'right_ankle', x: 0.55, y: hipY + 0.30, score: confidence },
    ],
    timestamp,
  };
}

/**
 * Generate N calibration frames at a steady hip Y, then return state.
 * Uses DEFAULT_CONFIG.calibrationFrames (15) frames.
 */
function calibrate(
  baselineHipY: number,
  config: JumpConfig = DEFAULT_CONFIG,
): JumpDetectorState {
  let state = createInitialState();
  const frameDuration = 33; // ~30 FPS
  for (let i = 0; i < config.calibrationFrames; i++) {
    state = processFrame(state, makeFrame(baselineHipY, i * frameDuration), config);
  }
  return state;
}

/**
 * Simulate a single jump: descend from baseline → peak → return to baseline.
 * Returns array of PoseFrames. "peak" is lower Y (higher jump).
 */
function simulateJumpFrames(
  baselineY: number,
  peakY: number,
  startTime: number,
  frameDuration: number = 33,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const steps = 5;
  let time = startTime;

  // Ascending (Y decreases = rising)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = baselineY + (peakY - baselineY) * t;
    frames.push(makeFrame(y, time));
    time += frameDuration;
  }

  // Descending (Y increases = falling)
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps;
    const y = baselineY + (peakY - baselineY) * t;
    frames.push(makeFrame(y, time));
    time += frameDuration;
  }

  return frames;
}

// ---------------------------------------------------------------------------
// extractMidpointY
// ---------------------------------------------------------------------------
console.log('\nextractMidpointY');

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.4, y: 0.50, score: 0.9 },
    { name: 'right_hip', x: 0.6, y: 0.52, score: 0.9 },
  ];
  const result = extractMidpointY(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.51) < 0.001, `average of 0.50 and 0.52 = ${result}`);
})();

(() => {
  const result = extractMidpointY([], ['left_hip'], 0.5);
  assert(result === null, 'empty keypoints → null');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.4, y: 0.50, score: 0.3 },
    { name: 'right_hip', x: 0.6, y: 0.52, score: 0.2 },
  ];
  const result = extractMidpointY(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result === null, 'all below confidence → null');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.4, y: 0.50, score: 0.9 },
    { name: 'right_hip', x: 0.6, y: 0.54, score: 0.3 },
  ];
  const result = extractMidpointY(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.50) < 0.001, 'only high-confidence keypoint used');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.4, y: 0.50, score: 0.9 },
    { name: 'nose', x: 0.5, y: 0.20, score: 0.95 },
  ];
  const result = extractMidpointY(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.50) < 0.001, 'ignores non-matching keypoint names');
})();

// ---------------------------------------------------------------------------
// extractHipY / extractAnkleY
// ---------------------------------------------------------------------------
console.log('\nextractHipY / extractAnkleY');

(() => {
  const frame = makeFrame(0.45, 0);
  const hipY = extractHipY(frame.keypoints, 0.5);
  assert(hipY !== null && Math.abs(hipY - 0.45) < 0.001, `extractHipY = ${hipY}`);
})();

(() => {
  const frame = makeFrame(0.45, 0);
  const ankleY = extractAnkleY(frame.keypoints, 0.5);
  assert(ankleY !== null && Math.abs(ankleY - 0.75) < 0.001, `extractAnkleY = ${ankleY}`);
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'nose', x: 0.5, y: 0.1, score: 0.9 },
  ];
  assert(extractHipY(kps, 0.5) === null, 'no hips → null');
  assert(extractAnkleY(kps, 0.5) === null, 'no ankles → null');
})();

// ---------------------------------------------------------------------------
// computeBaseline
// ---------------------------------------------------------------------------
console.log('\ncomputeBaseline');

(() => {
  const result = computeBaseline([0.45, 0.47, 0.46, 0.44, 0.48]);
  assert(Math.abs(result - 0.46) < 0.001, `median of 5 values = ${result}`);
})();

(() => {
  const result = computeBaseline([0.44, 0.46, 0.48, 0.50]);
  assert(Math.abs(result - 0.47) < 0.001, `median of 4 values = ${result}`);
})();

(() => {
  const result = computeBaseline([0.45]);
  assert(Math.abs(result - 0.45) < 0.001, 'single element');
})();

(() => {
  const result = computeBaseline([]);
  assert(result === 0, 'empty → 0');
})();

// ---------------------------------------------------------------------------
// computeDisplacement
// ---------------------------------------------------------------------------
console.log('\ncomputeDisplacement');

(() => {
  const d = computeDisplacement(0.50, 0.45);
  assert(Math.abs(d - 0.05) < 0.001, `jumping up → positive: ${d}`);
})();

(() => {
  const d = computeDisplacement(0.50, 0.50);
  assert(Math.abs(d) < 0.001, 'at baseline → zero');
})();

(() => {
  const d = computeDisplacement(0.50, 0.55);
  assert(Math.abs(d - (-0.05)) < 0.001, `crouching → negative: ${d}`);
})();

// ---------------------------------------------------------------------------
// estimateJumpHeightCm
// ---------------------------------------------------------------------------
console.log('\nestimateJumpHeightCm');

(() => {
  const cm = estimateJumpHeightCm(0.10);
  assert(cm === 20.0, `0.10 displacement × 200cm = ${cm}cm`);
})();

(() => {
  const cm = estimateJumpHeightCm(0.10, 250);
  assert(cm === 25.0, `0.10 × 250cm = ${cm}cm`);
})();

(() => {
  const cm = estimateJumpHeightCm(0);
  assert(cm === 0, 'zero displacement = 0cm');
})();

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------
console.log('\ncreateInitialState');

(() => {
  const state = createInitialState();
  assert(state.phase === 'calibrating', 'starts in calibrating phase');
  assert(state.baseline === null, 'baseline is null');
  assert(state.jumps.length === 0, 'no jumps');
  assert(state.frameCount === 0, 'frameCount is 0');
  assert(state.calibrationBuffer.length === 0, 'calibration buffer empty');
})();

// ---------------------------------------------------------------------------
// processFrame — calibration
// ---------------------------------------------------------------------------
console.log('\nprocessFrame — calibration');

(() => {
  let state = createInitialState();
  const frame = makeFrame(0.50, 0);
  state = processFrame(state, frame);
  assert(state.phase === 'calibrating', 'still calibrating after 1 frame');
  assert(state.calibrationBuffer.length === 1, 'buffer has 1 entry');
  assert(state.frameCount === 1, 'frameCount incremented');
})();

(() => {
  const state = calibrate(0.50);
  assert(state.phase === 'grounded', 'transitions to grounded after calibration');
  assert(state.baseline !== null, 'baseline is set');
  assert(Math.abs(state.baseline! - 0.50) < 0.001, `baseline = ${state.baseline}`);
})();

(() => {
  // Low confidence frames during calibration are skipped
  let state = createInitialState();
  for (let i = 0; i < 5; i++) {
    state = processFrame(state, makeFrame(0.50, i * 33, 0.2)); // below confidence
  }
  assert(state.calibrationBuffer.length === 0, 'low-confidence frames skipped');
  assert(state.frameCount === 5, 'frameCount still increments');
})();

(() => {
  // Baseline uses median (robust to outliers)
  let state = createInitialState();
  const config = { ...DEFAULT_CONFIG, calibrationFrames: 5 };
  const values = [0.50, 0.50, 0.50, 0.50, 0.90]; // one outlier
  for (let i = 0; i < 5; i++) {
    state = processFrame(state, makeFrame(values[i], i * 33), config);
  }
  assert(Math.abs(state.baseline! - 0.50) < 0.001, `baseline resists outlier: ${state.baseline}`);
})();

// ---------------------------------------------------------------------------
// processFrame — single jump
// ---------------------------------------------------------------------------
console.log('\nprocessFrame — single jump');

(() => {
  const baselineY = 0.50;
  const peakY = 0.40; // displacement = 0.10, well above threshold
  let state = calibrate(baselineY);

  const jumpFrames = simulateJumpFrames(baselineY, peakY, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame);
  }

  assert(state.jumps.length === 1, `detected 1 jump, got ${state.jumps.length}`);
  assert(state.phase === 'grounded', 'returns to grounded after landing');
})();

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  const jumpFrames = simulateJumpFrames(baselineY, peakY, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame);
  }

  const jump = state.jumps[0];
  assert(jump.jumpNumber === 1, 'first jump is #1');
  assert(jump.peakDisplacement > 0.08, `peak displacement = ${jump.peakDisplacement}`);
  assert(jump.duration > 0, `duration = ${jump.duration}ms`);
  assert(jump.takeoffTimestamp < jump.timestamp, 'takeoff before landing');
})();

// Jump too small — below threshold
(() => {
  const baselineY = 0.50;
  const peakY = 0.49; // displacement = 0.01, below threshold of 0.04
  let state = calibrate(baselineY);

  const jumpFrames = simulateJumpFrames(baselineY, peakY, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame);
  }

  assert(state.jumps.length === 0, 'tiny hop below threshold not counted');
})();

// ---------------------------------------------------------------------------
// processFrame — multiple jumps
// ---------------------------------------------------------------------------
console.log('\nprocessFrame — multiple jumps');

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  // 3 jumps spaced apart
  for (let i = 0; i < 3; i++) {
    const startTime = 500 + i * 500; // well beyond cooldown
    const jumpFrames = simulateJumpFrames(baselineY, peakY, startTime);
    for (const frame of jumpFrames) {
      state = processFrame(state, frame);
    }
  }

  assert(state.jumps.length === 3, `detected 3 jumps, got ${state.jumps.length}`);
})();

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  for (let i = 0; i < 3; i++) {
    const startTime = 500 + i * 500;
    const jumpFrames = simulateJumpFrames(baselineY, peakY, startTime);
    for (const frame of jumpFrames) {
      state = processFrame(state, frame);
    }
  }

  // Sequential jump numbers
  assert(state.jumps[0].jumpNumber === 1, 'jump #1');
  assert(state.jumps[1].jumpNumber === 2, 'jump #2');
  assert(state.jumps[2].jumpNumber === 3, 'jump #3');
})();

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  for (let i = 0; i < 3; i++) {
    const startTime = 500 + i * 500;
    const jumpFrames = simulateJumpFrames(baselineY, peakY, startTime);
    for (const frame of jumpFrames) {
      state = processFrame(state, frame);
    }
  }

  // Timestamps increase
  assert(
    state.jumps[1].timestamp > state.jumps[0].timestamp,
    'jump 2 lands after jump 1',
  );
  assert(
    state.jumps[2].timestamp > state.jumps[1].timestamp,
    'jump 3 lands after jump 2',
  );
})();

// ---------------------------------------------------------------------------
// processFrame — cooldown
// ---------------------------------------------------------------------------
console.log('\nprocessFrame — cooldown');

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  const config = { ...DEFAULT_CONFIG, cooldownMs: 500, calibrationFrames: 5 };
  let state = calibrate(baselineY, config);

  // Two jumps very close together (within cooldown)
  const jump1 = simulateJumpFrames(baselineY, peakY, 200, 10); // ~120ms total
  const jump2 = simulateJumpFrames(baselineY, peakY, 350, 10); // starts 150ms later

  for (const f of [...jump1, ...jump2]) {
    state = processFrame(state, f, config);
  }

  assert(state.jumps.length === 1, `cooldown blocks second jump: got ${state.jumps.length}`);
})();

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  const config = { ...DEFAULT_CONFIG, cooldownMs: 100, calibrationFrames: 5 };
  let state = calibrate(baselineY, config);

  // Two jumps with enough gap
  const jump1 = simulateJumpFrames(baselineY, peakY, 200, 33);
  const jump2 = simulateJumpFrames(baselineY, peakY, 800, 33); // 600ms later

  for (const f of [...jump1, ...jump2]) {
    state = processFrame(state, f, config);
  }

  assert(state.jumps.length === 2, `both jumps counted with low cooldown: got ${state.jumps.length}`);
})();

// First jump has no cooldown constraint
(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  const jumpFrames = simulateJumpFrames(baselineY, peakY, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame);
  }

  assert(state.jumps.length === 1, 'first jump always counted');
})();

// ---------------------------------------------------------------------------
// processFrame — low confidence during detection
// ---------------------------------------------------------------------------
console.log('\nprocessFrame — low confidence');

(() => {
  let state = calibrate(0.50);
  // Feed a low-confidence frame while grounded — should not trigger anything
  state = processFrame(state, makeFrame(0.30, 600, 0.2));
  assert(state.phase === 'grounded', 'low-confidence frame ignored while grounded');
  assert(state.jumps.length === 0, 'no false jump from bad frame');
})();

(() => {
  const baselineY = 0.50;
  let state = calibrate(baselineY);

  // Start a jump normally
  state = processFrame(state, makeFrame(0.44, 500)); // displacement 0.06 > threshold
  assert(state.phase === 'airborne', 'airborne after good frame');

  // Low-confidence frame while airborne — should not reset phase
  state = processFrame(state, makeFrame(0.50, 533, 0.2));
  assert(state.phase === 'airborne', 'still airborne after low-confidence frame');
})();

// ---------------------------------------------------------------------------
// getSessionResult — stats
// ---------------------------------------------------------------------------
console.log('\ngetSessionResult — stats');

(() => {
  const state = calibrate(0.50);
  const result = getSessionResult(state, 30000);
  assert(result.totalJumps === 0, 'no jumps → 0');
  assert(result.avgPace === 0, 'no jumps → avgPace 0');
})();

(() => {
  const baselineY = 0.50;
  const peakY = 0.40;
  let state = calibrate(baselineY);

  for (let i = 0; i < 5; i++) {
    const startTime = 500 + i * 600;
    const jumpFrames = simulateJumpFrames(baselineY, peakY, startTime);
    for (const frame of jumpFrames) {
      state = processFrame(state, frame);
    }
  }

  const result = getSessionResult(state, 10000);
  assert(result.totalJumps === 5, `5 jumps counted: got ${result.totalJumps}`);
  assert(result.repsPer10Sec === 5, `5 jumps in 10s = 5 per 10s: got ${result.repsPer10Sec}`);
})();

(() => {
  // avgPace with 2 jumps 1 second apart
  let state = calibrate(0.50);
  // Simulate 2 jump events manually
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 1000, takeoffTimestamp: 900, peakDisplacement: 0.08, duration: 100 },
      { jumpNumber: 2, timestamp: 2000, takeoffTimestamp: 1900, peakDisplacement: 0.08, duration: 100 },
    ],
  };

  const result = getSessionResult(state, 5000);
  assert(result.avgPace === 1.0, `1 second between jumps: avgPace = ${result.avgPace}`);
})();

(() => {
  // Single jump — avgPace should be 0
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 1000, takeoffTimestamp: 900, peakDisplacement: 0.08, duration: 100 },
    ],
  };

  const result = getSessionResult(state, 5000);
  assert(result.avgPace === 0, 'single jump → avgPace 0');
})();

(() => {
  // repsPer10Sec with 0 duration
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 100, takeoffTimestamp: 50, peakDisplacement: 0.08, duration: 50 },
    ],
  };

  const result = getSessionResult(state, 0);
  assert(result.repsPer10Sec === 0, 'zero duration → repsPer10Sec 0');
})();

(() => {
  // rawKeypoints passed through
  const state = calibrate(0.50);
  const raw = [[{ name: 'test', x: 0, y: 0, score: 1 }]];
  const result = getSessionResult(state, 1000, DEFAULT_CONFIG, raw);
  assert(result.rawKeypoints.length === 1, 'rawKeypoints passed through');
})();

// ---------------------------------------------------------------------------
// getSessionResult — warnings
// ---------------------------------------------------------------------------
console.log('\ngetSessionResult — warnings');

(() => {
  // Low jump warning
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.02, duration: 50 },
      { jumpNumber: 2, timestamp: 1000, takeoffTimestamp: 950, peakDisplacement: 0.08, duration: 50 },
    ],
  };

  const result = getSessionResult(state, 5000);
  const lowWarning = result.warnings.find((w) => w.includes('low height'));
  assert(lowWarning !== undefined, 'low jump warning present');
  assert(lowWarning!.includes('1 jump'), `singular form: "${lowWarning}"`);
})();

(() => {
  // Multiple low jumps
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.01, duration: 50 },
      { jumpNumber: 2, timestamp: 1000, takeoffTimestamp: 950, peakDisplacement: 0.02, duration: 50 },
    ],
  };

  const result = getSessionResult(state, 5000);
  const lowWarning = result.warnings.find((w) => w.includes('low height'));
  assert(lowWarning!.includes('2 jumps'), `plural form: "${lowWarning}"`);
})();

(() => {
  // Pacing inconsistency warning
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.08, duration: 50 },
      { jumpNumber: 2, timestamp: 600, takeoffTimestamp: 550, peakDisplacement: 0.08, duration: 50 },
      { jumpNumber: 3, timestamp: 2500, takeoffTimestamp: 2450, peakDisplacement: 0.08, duration: 50 },
    ],
  };

  const result = getSessionResult(state, 5000);
  const pacingWarning = result.warnings.find((w) => w.includes('inconsistent'));
  assert(pacingWarning !== undefined, 'pacing warning for erratic intervals');
})();

(() => {
  // No jumps warning
  const state = calibrate(0.50); // grounded, no jumps
  const result = getSessionResult(state, 5000);
  const noJumpsWarning = result.warnings.find((w) => w.includes('No jumps'));
  assert(noJumpsWarning !== undefined, 'no-jumps warning when none detected');
})();

(() => {
  // No warnings when everything is good
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 400, peakDisplacement: 0.08, duration: 100 },
      { jumpNumber: 2, timestamp: 1000, takeoffTimestamp: 900, peakDisplacement: 0.09, duration: 100 },
      { jumpNumber: 3, timestamp: 1500, takeoffTimestamp: 1400, peakDisplacement: 0.07, duration: 100 },
    ],
  };

  const result = getSessionResult(state, 5000);
  assert(result.warnings.length === 0, `no warnings: got ${result.warnings.length}`);
})();

// ---------------------------------------------------------------------------
// Full session simulation
// ---------------------------------------------------------------------------
console.log('\nFull session simulation');

(() => {
  const baselineY = 0.50;
  const peakY = 0.42;
  let state = calibrate(baselineY);

  // 5 jumps, each ~600ms apart
  for (let i = 0; i < 5; i++) {
    const startTime = 500 + i * 600;
    const jumpFrames = simulateJumpFrames(baselineY, peakY, startTime);
    for (const frame of jumpFrames) {
      state = processFrame(state, frame);
    }
  }

  const result = getSessionResult(state, 30000);
  assert(result.totalJumps === 5, `total: ${result.totalJumps}`);
  assert(result.repsPer10Sec > 0, `repsPer10Sec: ${result.repsPer10Sec}`);
  assert(result.avgPace > 0, `avgPace: ${result.avgPace}`);
})();

// Session with mixed good and low jumps
(() => {
  const baselineY = 0.50;
  let state = calibrate(baselineY);

  // 2 good jumps (displacement 0.10, 0.08) + 1 low jump (displacement 0.045)
  const good1 = simulateJumpFrames(baselineY, 0.40, 500);
  const good2 = simulateJumpFrames(baselineY, 0.42, 1200);
  const low1 = simulateJumpFrames(baselineY, 0.455, 1900); // displacement 0.045 — above detect (0.04), below low (0.06)

  for (const f of [...good1, ...good2, ...low1]) {
    state = processFrame(state, f);
  }

  const result = getSessionResult(state, 10000);
  assert(result.totalJumps === 3, `3 jumps total: got ${result.totalJumps}`);
  // The low jump should be counted but warned about
  const hasLowWarning = result.warnings.some((w) => w.includes('low height'));
  assert(hasLowWarning, 'low jump warning for the weak jump');
})();

// ---------------------------------------------------------------------------
// Tone — no banned words in warnings
// ---------------------------------------------------------------------------
console.log('\nTone — no banned words in warnings');

(() => {
  const banned = [
    'grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate',
    'hustle', 'no excuses', 'pain', 'failure', 'weak', 'bad',
  ];

  // Generate all possible warnings
  const warnings: string[] = [];

  // Low jump warning (singular + plural)
  let state1 = calibrate(0.50);
  state1 = {
    ...state1,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.01, duration: 50 },
    ],
  };
  warnings.push(...getSessionResult(state1, 5000).warnings);

  let state2 = calibrate(0.50);
  state2 = {
    ...state2,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.01, duration: 50 },
      { jumpNumber: 2, timestamp: 1000, takeoffTimestamp: 950, peakDisplacement: 0.01, duration: 50 },
    ],
  };
  warnings.push(...getSessionResult(state2, 5000).warnings);

  // Pacing warning
  let state3 = calibrate(0.50);
  state3 = {
    ...state3,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.08, duration: 50 },
      { jumpNumber: 2, timestamp: 600, takeoffTimestamp: 550, peakDisplacement: 0.08, duration: 50 },
      { jumpNumber: 3, timestamp: 2500, takeoffTimestamp: 2450, peakDisplacement: 0.08, duration: 50 },
    ],
  };
  warnings.push(...getSessionResult(state3, 5000).warnings);

  // No jumps warning
  warnings.push(...getSessionResult(calibrate(0.50), 5000).warnings);

  let clean = true;
  for (const w of warnings) {
    const lower = w.toLowerCase();
    for (const word of banned) {
      if (lower.includes(word)) {
        console.error(`    BANNED "${word}" in warning: "${w}"`);
        clean = false;
      }
    }
  }

  assert(clean, 'no banned words in any warning text');
})();

// Warnings are constructive (contain actionable suggestion or neutral observation)
(() => {
  let state = calibrate(0.50);
  state = {
    ...state,
    jumps: [
      { jumpNumber: 1, timestamp: 500, takeoffTimestamp: 450, peakDisplacement: 0.01, duration: 50 },
    ],
  };

  const result = getSessionResult(state, 5000);
  const lowWarning = result.warnings.find((w) => w.includes('low height'));
  assert(
    lowWarning!.includes('Focus') || lowWarning!.includes('Try'),
    'low jump warning includes constructive guidance',
  );
})();

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
console.log('\nEdge cases');

// Zero frames after calibration
(() => {
  const state = calibrate(0.50);
  const result = getSessionResult(state, 30000);
  assert(result.totalJumps === 0, 'zero frames after calibration → 0 jumps');
})();

// All frames low confidence (no calibration completes)
(() => {
  let state = createInitialState();
  for (let i = 0; i < 30; i++) {
    state = processFrame(state, makeFrame(0.50, i * 33, 0.1));
  }
  assert(state.phase === 'calibrating', 'never leaves calibrating with low confidence');
  assert(state.baseline === null, 'no baseline set');

  const result = getSessionResult(state, 5000);
  // Should NOT show "no jumps" warning since we never got past calibration
  const noJumpsWarning = result.warnings.find((w) => w.includes('No jumps'));
  assert(noJumpsWarning === undefined, 'no false warning during calibration phase');
})();

// Very short session (1 second)
(() => {
  const baselineY = 0.50;
  let state = calibrate(baselineY);
  const jumpFrames = simulateJumpFrames(baselineY, 0.40, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame);
  }
  const result = getSessionResult(state, 1000);
  assert(result.totalJumps === 1, 'short session still counts');
  assert(result.repsPer10Sec === 10, `1 jump in 1s = 10 per 10s: got ${result.repsPer10Sec}`);
})();

// State immutability — processFrame does not mutate input
(() => {
  const state = calibrate(0.50);
  const jumpsBefore = state.jumps.length;
  const phaseBefore = state.phase;

  const frame = makeFrame(0.44, 600); // would trigger takeoff
  const next = processFrame(state, frame);

  assert(state.jumps.length === jumpsBefore, 'original jumps unchanged');
  assert(state.phase === phaseBefore, 'original phase unchanged');
  assert(next.phase === 'airborne', 'new state has updated phase');
})();

// Config overrides
(() => {
  const config = { ...DEFAULT_CONFIG, jumpThreshold: 0.20, calibrationFrames: 5 };
  let state = calibrate(0.50, config);

  // Normal jump (displacement 0.10) is below custom threshold of 0.20
  const jumpFrames = simulateJumpFrames(0.50, 0.40, 500);
  for (const frame of jumpFrames) {
    state = processFrame(state, frame, config);
  }

  assert(state.jumps.length === 0, 'custom high threshold filters out normal jump');
})();

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG values are sensible
// ---------------------------------------------------------------------------
console.log('\nDEFAULT_CONFIG');

(() => {
  assert(DEFAULT_CONFIG.jumpThreshold > 0, 'jumpThreshold > 0');
  assert(DEFAULT_CONFIG.landThreshold > 0, 'landThreshold > 0');
  assert(DEFAULT_CONFIG.landThreshold < DEFAULT_CONFIG.jumpThreshold, 'landThreshold < jumpThreshold (hysteresis)');
  assert(DEFAULT_CONFIG.minConfidence >= 0 && DEFAULT_CONFIG.minConfidence <= 1, 'minConfidence in [0, 1]');
  assert(DEFAULT_CONFIG.calibrationFrames >= 5, 'calibrationFrames >= 5');
  assert(DEFAULT_CONFIG.cooldownMs >= 50, 'cooldownMs >= 50');
  assert(DEFAULT_CONFIG.sessionDurationMs === 30000, 'default session is 30s');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
