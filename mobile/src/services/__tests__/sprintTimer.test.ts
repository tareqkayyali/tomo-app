/**
 * Tests for Sprint Timer Service
 * Validates keypoint extraction (X-axis), calibration, start/finish detection,
 * direction auto-detection, FPS monitoring, warnings, and edge cases.
 *
 * No React Native dependencies — imports directly from the service.
 */

import {
  type Keypoint,
  type PoseFrame,
  type SprintConfig,
  type SprintDetectorState,
  DEFAULT_SPRINT_CONFIG,
  extractMidpointX,
  extractHipX,
  computeAvgFps,
  getDirectionLabel,
  estimateSpeedMps,
  createSprintState,
  processSprintFrame,
  getSprintResult,
} from '../sprintTimer';

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
// Frame generators
// ---------------------------------------------------------------------------

/** Build a PoseFrame with hip at the given X, fixed Y. */
function makeFrame(
  hipX: number,
  timestamp: number,
  hipY: number = 0.50,
  confidence: number = 0.9,
): PoseFrame {
  return {
    keypoints: [
      { name: 'left_hip', x: hipX - 0.05, y: hipY, score: confidence },
      { name: 'right_hip', x: hipX + 0.05, y: hipY, score: confidence },
      { name: 'left_knee', x: hipX - 0.05, y: hipY + 0.15, score: confidence },
      { name: 'right_knee', x: hipX + 0.05, y: hipY + 0.15, score: confidence },
      { name: 'left_ankle', x: hipX - 0.05, y: hipY + 0.30, score: confidence },
      { name: 'right_ankle', x: hipX + 0.05, y: hipY + 0.30, score: confidence },
    ],
    timestamp,
  };
}

/** Calibrate by feeding N frames at a fixed hip X. */
function calibrate(
  hipX: number,
  config: SprintConfig = DEFAULT_SPRINT_CONFIG,
): SprintDetectorState {
  let state = createSprintState();
  for (let i = 0; i < config.calibrationFrames; i++) {
    state = processSprintFrame(state, makeFrame(hipX, i * 33), config);
  }
  return state;
}

/**
 * Generate frames for a linear sprint from startX to endX.
 * Returns frames at ~30 FPS (33ms intervals).
 */
function simulateSprintFrames(
  startX: number,
  endX: number,
  startTime: number,
  durationMs: number,
  frameDuration: number = 33,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const numFrames = Math.ceil(durationMs / frameDuration);

  for (let i = 0; i <= numFrames; i++) {
    const t = i / numFrames;
    const x = startX + (endX - startX) * t;
    frames.push(makeFrame(x, startTime + i * frameDuration));
  }

  return frames;
}

// ---------------------------------------------------------------------------
// extractMidpointX
// ---------------------------------------------------------------------------
console.log('\nextractMidpointX');

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.40, y: 0.50, score: 0.9 },
    { name: 'right_hip', x: 0.60, y: 0.50, score: 0.9 },
  ];
  const result = extractMidpointX(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.50) < 0.001, `average of 0.40 and 0.60 = ${result}`);
})();

(() => {
  const result = extractMidpointX([], ['left_hip'], 0.5);
  assert(result === null, 'empty keypoints → null');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.40, y: 0.50, score: 0.3 },
    { name: 'right_hip', x: 0.60, y: 0.50, score: 0.2 },
  ];
  const result = extractMidpointX(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result === null, 'all below confidence → null');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.40, y: 0.50, score: 0.9 },
    { name: 'right_hip', x: 0.80, y: 0.50, score: 0.3 },
  ];
  const result = extractMidpointX(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.40) < 0.001, 'only high-confidence keypoint used');
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'left_hip', x: 0.40, y: 0.50, score: 0.9 },
    { name: 'nose', x: 0.50, y: 0.10, score: 0.95 },
  ];
  const result = extractMidpointX(kps, ['left_hip', 'right_hip'], 0.5);
  assert(result !== null && Math.abs(result - 0.40) < 0.001, 'ignores non-matching names');
})();

// ---------------------------------------------------------------------------
// extractHipX
// ---------------------------------------------------------------------------
console.log('\nextractHipX');

(() => {
  const frame = makeFrame(0.30, 0);
  const hipX = extractHipX(frame.keypoints, 0.5);
  assert(hipX !== null && Math.abs(hipX - 0.30) < 0.001, `extractHipX = ${hipX}`);
})();

(() => {
  const kps: Keypoint[] = [
    { name: 'nose', x: 0.5, y: 0.1, score: 0.9 },
  ];
  assert(extractHipX(kps, 0.5) === null, 'no hips → null');
})();

(() => {
  const frame = makeFrame(0.70, 0, 0.50, 0.2);
  const hipX = extractHipX(frame.keypoints, 0.5);
  assert(hipX === null, 'low-confidence hips → null');
})();

// ---------------------------------------------------------------------------
// computeAvgFps
// ---------------------------------------------------------------------------
console.log('\ncomputeAvgFps');

(() => {
  const fps = computeAvgFps(31, 0, 1000);
  assert(fps === 30, `30 intervals in 1s = ${fps} FPS`);
})();

(() => {
  const fps = computeAvgFps(1, 0, 1000);
  assert(fps === 0, 'single frame → 0 FPS');
})();

(() => {
  const fps = computeAvgFps(10, 500, 500);
  assert(fps === 0, 'zero duration → 0 FPS');
})();

(() => {
  const fps = computeAvgFps(16, 0, 1000);
  assert(fps === 15, `15 intervals in 1s = ${fps} FPS`);
})();

// ---------------------------------------------------------------------------
// getDirectionLabel
// ---------------------------------------------------------------------------
console.log('\ngetDirectionLabel');

(() => {
  assert(getDirectionLabel(1) === 'left-to-right', '+1 → left-to-right');
  assert(getDirectionLabel(-1) === 'right-to-left', '-1 → right-to-left');
  assert(getDirectionLabel(0.5) === 'left-to-right', 'positive → left-to-right');
})();

// ---------------------------------------------------------------------------
// estimateSpeedMps
// ---------------------------------------------------------------------------
console.log('\nestimateSpeedMps');

(() => {
  const mps = estimateSpeedMps(1.0, 7);
  assert(mps === 7.0, `1.0 normalized × 7m = ${mps} m/s`);
})();

(() => {
  const mps = estimateSpeedMps(0.5, 10);
  assert(mps === 5.0, `0.5 × 10m = ${mps} m/s`);
})();

(() => {
  const mps = estimateSpeedMps(0);
  assert(mps === 0, 'zero velocity = 0 m/s');
})();

// ---------------------------------------------------------------------------
// createSprintState
// ---------------------------------------------------------------------------
console.log('\ncreateSprintState');

(() => {
  const state = createSprintState();
  assert(state.phase === 'calibrating', 'starts in calibrating');
  assert(state.startingX === null, 'startingX is null');
  assert(state.frameCount === 0, 'frameCount is 0');
  assert(state.timedOut === false, 'not timed out');
  assert(state.sprintDirection === 0, 'direction not set');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — calibration
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — calibration');

(() => {
  let state = createSprintState();
  state = processSprintFrame(state, makeFrame(0.10, 0));
  assert(state.phase === 'calibrating', 'still calibrating after 1 frame');
  assert(state.calibrationBuffer.length === 1, 'buffer has 1 entry');
})();

(() => {
  const state = calibrate(0.10);
  assert(state.phase === 'ready', 'transitions to ready after calibration');
  assert(state.startingX !== null, 'startingX is set');
  assert(Math.abs(state.startingX! - 0.10) < 0.001, `startingX = ${state.startingX}`);
})();

(() => {
  // Low-confidence frames skipped during calibration
  let state = createSprintState();
  for (let i = 0; i < 5; i++) {
    state = processSprintFrame(state, makeFrame(0.10, i * 33, 0.50, 0.2));
  }
  assert(state.calibrationBuffer.length === 0, 'low-confidence frames skipped');
  assert(state.frameCount === 5, 'frameCount still increments');
})();

(() => {
  // Baseline uses median (resist outliers)
  const config = { ...DEFAULT_SPRINT_CONFIG, calibrationFrames: 5 };
  let state = createSprintState();
  const values = [0.10, 0.10, 0.10, 0.10, 0.50]; // one outlier
  for (let i = 0; i < 5; i++) {
    state = processSprintFrame(state, makeFrame(values[i], i * 33), config);
  }
  assert(Math.abs(state.startingX! - 0.10) < 0.001, `baseline resists outlier: ${state.startingX}`);
})();

// ---------------------------------------------------------------------------
// processSprintFrame — start detection
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — start detection');

(() => {
  let state = calibrate(0.10);

  // Small sway — below threshold — should NOT start
  state = processSprintFrame(state, makeFrame(0.105, 600));
  assert(state.phase === 'ready', 'small sway below threshold stays ready');
})();

(() => {
  let state = calibrate(0.10);

  // Significant forward displacement — should START
  state = processSprintFrame(state, makeFrame(0.10, 500)); // set lastHipX
  state = processSprintFrame(state, makeFrame(0.12, 533)); // dx = 0.02 > 0.008
  assert(state.phase === 'sprinting', 'forward lunge triggers sprint');
  assert(state.startFrame > 0, 'startFrame recorded');
  assert(state.startTimestamp === 533, `startTimestamp = ${state.startTimestamp}`);
})();

// Direction auto-detect: left-to-right
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533)); // moving right
  assert(state.sprintDirection === 1, 'moving right → direction +1');
})();

// Direction auto-detect: right-to-left
(() => {
  let state = calibrate(0.90);
  state = processSprintFrame(state, makeFrame(0.90, 500));
  state = processSprintFrame(state, makeFrame(0.88, 533)); // moving left
  assert(state.sprintDirection === -1, 'moving left → direction -1');
})();

// lastHipX must exist for start detection
(() => {
  const config = { ...DEFAULT_SPRINT_CONFIG, calibrationFrames: 3 };
  let state = createSprintState();
  // 3 frames for calibration (set lastHipX = 0.10)
  for (let i = 0; i < 3; i++) {
    state = processSprintFrame(state, makeFrame(0.10, i * 33), config);
  }
  assert(state.phase === 'ready', 'ready after calibration');

  // Next frame with big displacement — should detect start because lastHipX was set during calibration
  state = processSprintFrame(state, makeFrame(0.12, 150), config);
  assert(state.phase === 'sprinting', 'starts sprinting with displacement from last calibration frame');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — finish detection (left-to-right)
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — finish (left-to-right)');

(() => {
  let state = calibrate(0.10);

  // Start sprint
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));
  assert(state.phase === 'sprinting', 'sprinting');

  // Sprint across frame: 0.12 → 0.82 (displacement = 0.82 - 0.10 = 0.72 ≥ 0.70)
  const sprintFrames = simulateSprintFrames(0.12, 0.82, 566, 1000);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  assert(state.phase === 'finished', 'detected finish');
  assert(state.endTimestamp > state.startTimestamp, 'endTimestamp > startTimestamp');
  assert(state.endFrame > state.startFrame, 'endFrame > startFrame');
})();

// Time is correct (approximately)
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // Sprint takes ~1 second
  const sprintFrames = simulateSprintFrames(0.12, 0.85, 566, 1000);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  assert(result.timeInSeconds > 0.5, `time > 0.5s: ${result.timeInSeconds}`);
  assert(result.timeInSeconds < 2.0, `time < 2.0s: ${result.timeInSeconds}`);
})();

// Not enough displacement — stays sprinting
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // Only move to 0.50 (displacement = 0.40, below 0.70 threshold)
  const frames = simulateSprintFrames(0.12, 0.50, 566, 500);
  for (const frame of frames) {
    state = processSprintFrame(state, frame);
  }

  assert(state.phase === 'sprinting', 'not enough displacement → still sprinting');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — finish detection (right-to-left)
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — finish (right-to-left)');

(() => {
  let state = calibrate(0.90);

  // Start sprint (moving left)
  state = processSprintFrame(state, makeFrame(0.90, 500));
  state = processSprintFrame(state, makeFrame(0.88, 533));
  assert(state.phase === 'sprinting', 'sprinting right-to-left');

  // Sprint across frame: 0.88 → 0.18 (displacement in direction = (0.18-0.90)*-1 = 0.72)
  const sprintFrames = simulateSprintFrames(0.88, 0.18, 566, 1000);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  assert(state.phase === 'finished', 'right-to-left finish detected');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — timeout
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — timeout');

(() => {
  const config = { ...DEFAULT_SPRINT_CONFIG, maxSprintTimeMs: 500, calibrationFrames: 5 };
  let state = calibrate(0.10, config);

  // Start sprint
  state = processSprintFrame(state, makeFrame(0.10, 200), config);
  state = processSprintFrame(state, makeFrame(0.12, 233), config);

  // Barely moving for a long time (600ms > 500ms max)
  for (let i = 0; i < 20; i++) {
    state = processSprintFrame(
      state,
      makeFrame(0.12 + i * 0.005, 266 + i * 33),
      config,
    );
  }

  assert(state.phase === 'finished', 'timeout triggers finish');
  assert(state.timedOut === true, 'timedOut flag set');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — lost tracking during sprint
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — lost tracking');

(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // 6 low-confidence frames during sprint
  for (let i = 0; i < 6; i++) {
    state = processSprintFrame(state, makeFrame(0.20, 566 + i * 33, 0.50, 0.1));
  }

  assert(state.consecutiveLostFrames === 6, `lost 6 consecutive: ${state.consecutiveLostFrames}`);
  assert(state.maxConsecutiveLostFrames === 6, 'max lost frames tracked');
  assert(state.phase === 'sprinting', 'still sprinting (not auto-cancelled)');
})();

// Lost frames counter resets on good frame
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // 3 lost, then 1 good, then 2 lost
  for (let i = 0; i < 3; i++) {
    state = processSprintFrame(state, makeFrame(0.20, 566 + i * 33, 0.50, 0.1));
  }
  state = processSprintFrame(state, makeFrame(0.30, 665)); // good frame
  for (let i = 0; i < 2; i++) {
    state = processSprintFrame(state, makeFrame(0.35, 698 + i * 33, 0.50, 0.1));
  }

  assert(state.consecutiveLostFrames === 2, 'counter reset after good frame');
  assert(state.maxConsecutiveLostFrames === 3, 'max still reflects worst streak');
})();

// ---------------------------------------------------------------------------
// processSprintFrame — peak displacement tracking
// ---------------------------------------------------------------------------
console.log('\nprocessSprintFrame — peak displacement');

(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533)); // start, dx = 0.02

  // Accelerating: bigger jumps
  state = processSprintFrame(state, makeFrame(0.16, 566)); // dx = 0.04
  state = processSprintFrame(state, makeFrame(0.22, 599)); // dx = 0.06
  state = processSprintFrame(state, makeFrame(0.26, 632)); // dx = 0.04

  assert(
    Math.abs(state.peakFrameDisplacement - 0.06) < 0.001,
    `peak = 0.06: got ${state.peakFrameDisplacement}`,
  );
})();

// ---------------------------------------------------------------------------
// Full sprint simulation — left-to-right
// ---------------------------------------------------------------------------
console.log('\nFull sprint simulation — left-to-right');

(() => {
  let state = calibrate(0.10);

  // Trigger start
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // Sprint: 0.12 → 0.85 in 1.2 seconds
  const sprintFrames = simulateSprintFrames(0.12, 0.85, 566, 1200);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  assert(result.timeInSeconds > 0, `time = ${result.timeInSeconds}s`);
  assert(result.startFrame > 0, `startFrame = ${result.startFrame}`);
  assert(result.endFrame > result.startFrame, 'endFrame > startFrame');
  assert(result.avgFps > 0, `avgFps = ${result.avgFps}`);
  assert(result.peakVelocity > 0, `peakVelocity = ${result.peakVelocity}`);
  assert(result.notes.includes('Sprint completed'), `notes: "${result.notes}"`);
  assert(result.notes.includes('left-to-right'), 'notes include direction');
})();

// Full sprint — right-to-left
(() => {
  let state = calibrate(0.90);

  state = processSprintFrame(state, makeFrame(0.90, 500));
  state = processSprintFrame(state, makeFrame(0.88, 533));

  const sprintFrames = simulateSprintFrames(0.88, 0.15, 566, 1000);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  assert(result.timeInSeconds > 0, `right-to-left time = ${result.timeInSeconds}s`);
  assert(result.notes.includes('right-to-left'), 'notes include direction');
})();

// ---------------------------------------------------------------------------
// getSprintResult — warnings
// ---------------------------------------------------------------------------
console.log('\ngetSprintResult — warnings');

// Low FPS warning
(() => {
  let state = calibrate(0.10);
  // Simulate very slow frame rate (100ms per frame = 10 FPS)
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 600)); // start

  const sprintFrames = simulateSprintFrames(0.12, 0.85, 700, 2000, 100);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  const fpsWarning = result.warnings.find((w) => w.includes('Frame rate'));
  assert(fpsWarning !== undefined, 'low FPS warning present');
})();

// Tracking lost warning
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // 5 lost frames during sprint
  for (let i = 0; i < 5; i++) {
    state = processSprintFrame(state, makeFrame(0.20, 566 + i * 33, 0.50, 0.1));
  }

  // Finish the sprint
  const sprintFrames = simulateSprintFrames(0.12, 0.85, 800, 800);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  const trackingWarning = result.warnings.find((w) => w.includes('Tracking was lost'));
  assert(trackingWarning !== undefined, 'tracking lost warning present');
})();

// Too-fast warning
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  // Insanely fast sprint (100ms)
  const sprintFrames = simulateSprintFrames(0.12, 0.85, 566, 100, 10);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  const fastWarning = result.warnings.find((w) => w.includes('too fast'));
  assert(fastWarning !== undefined, 'too-fast warning present');
})();

// Timeout warning
(() => {
  const config = { ...DEFAULT_SPRINT_CONFIG, maxSprintTimeMs: 200, calibrationFrames: 5 };
  let state = calibrate(0.10, config);
  state = processSprintFrame(state, makeFrame(0.10, 200), config);
  state = processSprintFrame(state, makeFrame(0.12, 233), config);

  // Barely move past timeout
  for (let i = 0; i < 10; i++) {
    state = processSprintFrame(state, makeFrame(0.12 + i * 0.01, 266 + i * 33), config);
  }

  const result = getSprintResult(state, config);
  const timeoutWarning = result.warnings.find((w) => w.includes('maximum time'));
  assert(timeoutWarning !== undefined, 'timeout warning present');
})();

// Not completed warning
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));
  // Sprint but don't finish
  state = processSprintFrame(state, makeFrame(0.30, 600));

  const result = getSprintResult(state);
  const incompleteWarning = result.warnings.find((w) => w.includes('not completed'));
  assert(incompleteWarning !== undefined, 'incomplete warning present');
})();

// Calibration incomplete warning
(() => {
  let state = createSprintState();
  state = processSprintFrame(state, makeFrame(0.10, 0));

  const result = getSprintResult(state);
  const calWarning = result.warnings.find((w) => w.includes('Calibration'));
  assert(calWarning !== undefined, 'calibration warning present');
})();

// No warnings on clean sprint
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  const sprintFrames = simulateSprintFrames(0.12, 0.85, 566, 1200);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }

  const result = getSprintResult(state);
  assert(result.warnings.length === 0, `no warnings on clean sprint: got ${result.warnings.length}`);
})();

// ---------------------------------------------------------------------------
// getSprintResult — notes
// ---------------------------------------------------------------------------
console.log('\ngetSprintResult — notes');

// Ready state (no sprint)
(() => {
  const state = calibrate(0.10);
  const result = getSprintResult(state);
  assert(result.notes.includes('No sprint detected'), `ready notes: "${result.notes}"`);
  assert(result.timeInSeconds === 0, 'no time if no sprint');
})();

// Calibrating state
(() => {
  let state = createSprintState();
  state = processSprintFrame(state, makeFrame(0.10, 0));
  const result = getSprintResult(state);
  assert(result.notes.includes('Calibration incomplete'), `calibrating notes: "${result.notes}"`);
})();

// Sprinting state (incomplete)
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));
  state = processSprintFrame(state, makeFrame(0.30, 600));

  const result = getSprintResult(state);
  assert(result.notes.includes('not completed'), `sprinting notes: "${result.notes}"`);
})();

// ---------------------------------------------------------------------------
// Tone — no banned words in warnings or notes
// ---------------------------------------------------------------------------
console.log('\nTone — no banned words');

(() => {
  const banned = [
    'grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate',
    'hustle', 'no excuses', 'pain', 'failure', 'weak', 'bad', 'terrible',
  ];

  // Collect all possible warnings and notes
  const texts: string[] = [];

  // Clean sprint
  let s1 = calibrate(0.10);
  s1 = processSprintFrame(s1, makeFrame(0.10, 500));
  s1 = processSprintFrame(s1, makeFrame(0.12, 533));
  const sf = simulateSprintFrames(0.12, 0.85, 566, 1200);
  for (const f of sf) { s1 = processSprintFrame(s1, f); }
  const r1 = getSprintResult(s1);
  texts.push(r1.notes, ...r1.warnings);

  // Timed-out sprint
  const cfg2 = { ...DEFAULT_SPRINT_CONFIG, maxSprintTimeMs: 200, calibrationFrames: 5 };
  let s2 = calibrate(0.10, cfg2);
  s2 = processSprintFrame(s2, makeFrame(0.10, 200), cfg2);
  s2 = processSprintFrame(s2, makeFrame(0.12, 233), cfg2);
  for (let i = 0; i < 10; i++) {
    s2 = processSprintFrame(s2, makeFrame(0.12 + i * 0.01, 266 + i * 33), cfg2);
  }
  const r2 = getSprintResult(s2, cfg2);
  texts.push(r2.notes, ...r2.warnings);

  // Incomplete sprint
  let s3 = calibrate(0.10);
  s3 = processSprintFrame(s3, makeFrame(0.10, 500));
  s3 = processSprintFrame(s3, makeFrame(0.12, 533));
  s3 = processSprintFrame(s3, makeFrame(0.30, 600));
  const r3 = getSprintResult(s3);
  texts.push(r3.notes, ...r3.warnings);

  // Ready state
  const r4 = getSprintResult(calibrate(0.10));
  texts.push(r4.notes, ...r4.warnings);

  // Calibrating state
  let s5 = createSprintState();
  s5 = processSprintFrame(s5, makeFrame(0.10, 0));
  const r5 = getSprintResult(s5);
  texts.push(r5.notes, ...r5.warnings);

  let clean = true;
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const word of banned) {
      if (lower.includes(word)) {
        console.error(`    BANNED "${word}" in: "${text}"`);
        clean = false;
      }
    }
  }

  assert(clean, 'no banned words in any warning or note text');
})();

// ---------------------------------------------------------------------------
// State immutability
// ---------------------------------------------------------------------------
console.log('\nState immutability');

(() => {
  const state = calibrate(0.10);
  const phaseBefore = state.phase;
  const next = processSprintFrame(state, makeFrame(0.10, 500));
  const next2 = processSprintFrame(next, makeFrame(0.12, 533));

  assert(state.phase === phaseBefore, 'original state unchanged');
  assert(next2.phase === 'sprinting', 'new state updated');
})();

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
console.log('\nEdge cases');

// Zero frames → result has zero time
(() => {
  const state = createSprintState();
  const result = getSprintResult(state);
  assert(result.timeInSeconds === 0, 'zero frames → time 0');
  assert(result.avgFps === 0, 'zero frames → fps 0');
})();

// Finished state ignores further frames
(() => {
  let state = calibrate(0.10);
  state = processSprintFrame(state, makeFrame(0.10, 500));
  state = processSprintFrame(state, makeFrame(0.12, 533));

  const sprintFrames = simulateSprintFrames(0.12, 0.85, 566, 1000);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame);
  }
  const endFrame = state.endFrame;
  const endTimestamp = state.endTimestamp;

  // Feed more frames
  state = processSprintFrame(state, makeFrame(0.90, 5000));
  state = processSprintFrame(state, makeFrame(0.95, 5033));

  assert(state.endFrame === endFrame, 'endFrame not changed after finish');
  assert(state.endTimestamp === endTimestamp, 'endTimestamp not changed');
})();

// Custom config thresholds
(() => {
  const config = {
    ...DEFAULT_SPRINT_CONFIG,
    startDisplacementThreshold: 0.05,
    finishDisplacementThreshold: 0.30,
    calibrationFrames: 5,
  };

  let state = calibrate(0.10, config);
  state = processSprintFrame(state, makeFrame(0.10, 200), config);

  // Small displacement (0.02 < 0.05 threshold) — should NOT start
  state = processSprintFrame(state, makeFrame(0.12, 233), config);
  assert(state.phase === 'ready', 'custom high threshold: small displacement stays ready');

  // Big displacement triggers start
  state = processSprintFrame(state, makeFrame(0.20, 266), config);
  assert(state.phase === 'sprinting', 'custom threshold: big displacement starts');

  // Low finish threshold
  state = processSprintFrame(state, makeFrame(0.45, 400), config); // 0.45-0.10 = 0.35 ≥ 0.30
  assert(state.phase === 'finished', 'custom low finish threshold');
})();

// Very slow sprint at low FPS
(() => {
  const config = { ...DEFAULT_SPRINT_CONFIG, calibrationFrames: 5 };
  let state = calibrate(0.10, config);

  state = processSprintFrame(state, makeFrame(0.10, 500), config);
  state = processSprintFrame(state, makeFrame(0.12, 600), config); // start, 100ms frames

  // Very slow movement with 100ms frame intervals (~10 FPS)
  const sprintFrames = simulateSprintFrames(0.12, 0.85, 700, 3000, 100);
  for (const frame of sprintFrames) {
    state = processSprintFrame(state, frame, config);
  }

  const result = getSprintResult(state, config);
  assert(result.timeInSeconds > 0, 'slow sprint still timed');
  assert(result.avgFps < 15, `low FPS detected: ${result.avgFps}`);
  const fpsWarning = result.warnings.find((w) => w.includes('Frame rate'));
  assert(fpsWarning !== undefined, 'FPS warning on slow feed');
})();

// ---------------------------------------------------------------------------
// DEFAULT_SPRINT_CONFIG sanity
// ---------------------------------------------------------------------------
console.log('\nDEFAULT_SPRINT_CONFIG');

(() => {
  assert(DEFAULT_SPRINT_CONFIG.startDisplacementThreshold > 0, 'start threshold > 0');
  assert(DEFAULT_SPRINT_CONFIG.finishDisplacementThreshold > 0, 'finish threshold > 0');
  assert(
    DEFAULT_SPRINT_CONFIG.finishDisplacementThreshold > DEFAULT_SPRINT_CONFIG.startDisplacementThreshold,
    'finish > start threshold',
  );
  assert(DEFAULT_SPRINT_CONFIG.minConfidence >= 0, 'minConfidence >= 0');
  assert(DEFAULT_SPRINT_CONFIG.calibrationFrames >= 5, 'calibrationFrames >= 5');
  assert(DEFAULT_SPRINT_CONFIG.maxSprintTimeMs > DEFAULT_SPRINT_CONFIG.minSprintTimeMs, 'max > min time');
  assert(DEFAULT_SPRINT_CONFIG.fpsWarningThreshold > 0, 'fpsWarning > 0');
  assert(!('sessionDurationMs' in DEFAULT_SPRINT_CONFIG), 'no sessionDuration (sprints end on finish)');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
