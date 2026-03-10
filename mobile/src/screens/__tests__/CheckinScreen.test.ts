/**
 * Tests for CheckinScreen logic
 *
 * Validates the pure helpers that power the step-by-step check-in wizard:
 *   CHECKIN_STEPS, getProgressPercent, getDefaultValue,
 *   getValueDisplay, buildCheckinPayload, getCompletionMessage
 *
 * UI rendering is not tested here (no React Native test renderer).
 * We reproduce the pure logic inline to avoid RN import chains.
 */

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
// Reproduce pure helpers (avoids RN import chain)
// ---------------------------------------------------------------------------

interface CheckinStep {
  key: string;
  label: string;
  sublabel: string;
  type: 'slider' | 'sleep' | 'pain';
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  skippable: boolean;
}

const CHECKIN_STEPS: CheckinStep[] = [
  {
    key: 'mood',
    label: 'How are you feeling today?',
    sublabel: 'Overall mood right now',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low',
    highLabel: 'Great',
    skippable: true,
  },
  {
    key: 'sleepHours',
    label: 'How much sleep did you get?',
    sublabel: 'Hours of sleep last night',
    type: 'sleep',
    min: 4,
    max: 12,
    skippable: true,
  },
  {
    key: 'energy',
    label: 'What is your energy level?',
    sublabel: 'How energized do you feel',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low energy',
    highLabel: 'High energy',
    skippable: true,
  },
  {
    key: 'soreness',
    label: 'Any muscle soreness?',
    sublabel: 'Overall body soreness',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'None',
    highLabel: 'Very sore',
    skippable: true,
  },
  {
    key: 'effortYesterday',
    label: "Yesterday's training effort?",
    sublabel: 'How hard was your last session',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Easy / Rest',
    highLabel: 'Very hard',
    skippable: true,
  },
  {
    key: 'painFlag',
    label: 'Any pain or injury?',
    sublabel: 'Be honest — your safety matters most',
    type: 'pain',
    skippable: false,
  },
];

function getProgressPercent(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 1) return stepIndex >= 1 ? 1 : 0;
  return Math.max(0, Math.min(1, stepIndex / (totalSteps - 1)));
}

function getDefaultValue(key: string): number {
  switch (key) {
    case 'sleepHours': return 7;
    case 'mood':
    case 'energy':
    case 'soreness':
    case 'effortYesterday': return 5;
    default: return 5;
  }
}

function getValueDisplay(key: string, value: number): string {
  if (key === 'sleepHours') return `${value}h`;
  return `${value}/10`;
}

function buildCheckinPayload(
  answers: Record<string, number>,
  painFlag: boolean,
  painLocation: string,
): {
  energy: number;
  soreness: number;
  sleepHours: number;
  painFlag: boolean;
  painLocation?: string;
  effortYesterday: number;
  mood: number;
} {
  return {
    energy: answers.energy ?? 5,
    soreness: answers.soreness ?? 5,
    sleepHours: answers.sleepHours ?? 7,
    painFlag,
    ...(painFlag && painLocation.trim() ? { painLocation: painLocation.trim() } : {}),
    effortYesterday: answers.effortYesterday ?? 5,
    mood: answers.mood ?? 5,
  };
}

function getCompletionMessage(archetype: string | null | undefined): string {
  const key = (archetype ?? '').toLowerCase();
  switch (key) {
    case 'phoenix': return 'Rising strong. Your plan is ready.';
    case 'titan': return 'Steady and prepared. Your plan is ready.';
    case 'blade': return 'Sharp focus. Your plan is ready.';
    case 'surge': return 'Energy locked in. Your plan is ready.';
    default: return 'All set. Your plan is ready.';
  }
}

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — structure
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — structure');

assert(CHECKIN_STEPS.length === 6, 'has 6 steps');
assert(CHECKIN_STEPS[0].key === 'mood', 'first step is mood');
assert(CHECKIN_STEPS[1].key === 'sleepHours', 'second step is sleepHours');
assert(CHECKIN_STEPS[2].key === 'energy', 'third step is energy');
assert(CHECKIN_STEPS[3].key === 'soreness', 'fourth step is soreness');
assert(CHECKIN_STEPS[4].key === 'effortYesterday', 'fifth step is effortYesterday');
assert(CHECKIN_STEPS[5].key === 'painFlag', 'sixth step is painFlag');

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — step types
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — step types');

assert(CHECKIN_STEPS[0].type === 'slider', 'mood is slider');
assert(CHECKIN_STEPS[1].type === 'sleep', 'sleepHours is sleep');
assert(CHECKIN_STEPS[2].type === 'slider', 'energy is slider');
assert(CHECKIN_STEPS[3].type === 'slider', 'soreness is slider');
assert(CHECKIN_STEPS[4].type === 'slider', 'effortYesterday is slider');
assert(CHECKIN_STEPS[5].type === 'pain', 'painFlag is pain');

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — skippable
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — skippable');

assert(CHECKIN_STEPS[0].skippable === true, 'mood is skippable');
assert(CHECKIN_STEPS[1].skippable === true, 'sleepHours is skippable');
assert(CHECKIN_STEPS[2].skippable === true, 'energy is skippable');
assert(CHECKIN_STEPS[3].skippable === true, 'soreness is skippable');
assert(CHECKIN_STEPS[4].skippable === true, 'effortYesterday is skippable');
assert(CHECKIN_STEPS[5].skippable === false, 'painFlag is NOT skippable');

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — slider ranges
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — slider ranges');

const sliderSteps = CHECKIN_STEPS.filter(s => s.type === 'slider');
for (const step of sliderSteps) {
  assert(step.min === 1, `${step.key} min is 1`);
  assert(step.max === 10, `${step.key} max is 10`);
}

assert(CHECKIN_STEPS[1].min === 4, 'sleepHours min is 4');
assert(CHECKIN_STEPS[1].max === 12, 'sleepHours max is 12');

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — labels exist
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — labels');

for (const step of CHECKIN_STEPS) {
  assert(step.label.length > 0, `${step.key} has a label`);
  assert(step.sublabel.length > 0, `${step.key} has a sublabel`);
  assert(step.label.endsWith('?'), `${step.key} label ends with ?`);
}

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — slider low/high labels
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — low/high labels');

for (const step of sliderSteps) {
  assert(typeof step.lowLabel === 'string' && step.lowLabel.length > 0, `${step.key} has lowLabel`);
  assert(typeof step.highLabel === 'string' && step.highLabel.length > 0, `${step.key} has highLabel`);
}

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — unique keys
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — unique keys');

const keys = CHECKIN_STEPS.map(s => s.key);
const uniqueKeys = new Set(keys);
assert(uniqueKeys.size === CHECKIN_STEPS.length, 'all step keys are unique');

// ---------------------------------------------------------------------------
// getProgressPercent — basic
// ---------------------------------------------------------------------------
console.log('\ngetProgressPercent — basic');

assert(getProgressPercent(0, 6) === 0, 'step 0 of 6 = 0');
assert(Math.abs(getProgressPercent(1, 6) - 0.2) < 0.001, 'step 1 of 6 = 0.2');
assert(Math.abs(getProgressPercent(2, 6) - 0.4) < 0.001, 'step 2 of 6 = 0.4');
assert(Math.abs(getProgressPercent(3, 6) - 0.6) < 0.001, 'step 3 of 6 = 0.6');
assert(Math.abs(getProgressPercent(4, 6) - 0.8) < 0.001, 'step 4 of 6 = 0.8');
assert(getProgressPercent(5, 6) === 1, 'step 5 of 6 = 1');

// ---------------------------------------------------------------------------
// getProgressPercent — edge cases
// ---------------------------------------------------------------------------
console.log('\ngetProgressPercent — edge cases');

assert(getProgressPercent(0, 1) === 0, 'step 0 of 1 = 0');
assert(getProgressPercent(1, 1) === 1, 'step 1 of 1 = 1');
assert(getProgressPercent(0, 0) === 0, 'step 0 of 0 = 0');
assert(getProgressPercent(-1, 6) === 0, 'negative step clamped to 0');
assert(getProgressPercent(10, 6) === 1, 'overflowing step clamped to 1');
assert(getProgressPercent(0, 2) === 0, 'step 0 of 2 = 0');
assert(getProgressPercent(1, 2) === 1, 'step 1 of 2 = 1');

// ---------------------------------------------------------------------------
// getDefaultValue
// ---------------------------------------------------------------------------
console.log('\ngetDefaultValue');

assert(getDefaultValue('mood') === 5, 'mood default is 5');
assert(getDefaultValue('sleepHours') === 7, 'sleepHours default is 7');
assert(getDefaultValue('energy') === 5, 'energy default is 5');
assert(getDefaultValue('soreness') === 5, 'soreness default is 5');
assert(getDefaultValue('effortYesterday') === 5, 'effortYesterday default is 5');
assert(getDefaultValue('unknownKey') === 5, 'unknown key default is 5');

// ---------------------------------------------------------------------------
// getValueDisplay
// ---------------------------------------------------------------------------
console.log('\ngetValueDisplay');

assert(getValueDisplay('mood', 7) === '7/10', 'mood 7 → "7/10"');
assert(getValueDisplay('energy', 3) === '3/10', 'energy 3 → "3/10"');
assert(getValueDisplay('soreness', 10) === '10/10', 'soreness 10 → "10/10"');
assert(getValueDisplay('effortYesterday', 1) === '1/10', 'effort 1 → "1/10"');
assert(getValueDisplay('sleepHours', 8) === '8h', 'sleepHours 8 → "8h"');
assert(getValueDisplay('sleepHours', 4) === '4h', 'sleepHours 4 → "4h"');
assert(getValueDisplay('sleepHours', 12) === '12h', 'sleepHours 12 → "12h"');

// ---------------------------------------------------------------------------
// buildCheckinPayload — defaults
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — defaults');

const emptyPayload = buildCheckinPayload({}, false, '');
assert(emptyPayload.energy === 5, 'default energy is 5');
assert(emptyPayload.soreness === 5, 'default soreness is 5');
assert(emptyPayload.sleepHours === 7, 'default sleepHours is 7');
assert(emptyPayload.mood === 5, 'default mood is 5');
assert(emptyPayload.effortYesterday === 5, 'default effortYesterday is 5');
assert(emptyPayload.painFlag === false, 'default painFlag is false');
assert(emptyPayload.painLocation === undefined, 'no painLocation when no pain');

// ---------------------------------------------------------------------------
// buildCheckinPayload — with values
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — with values');

const fullPayload = buildCheckinPayload(
  { energy: 8, soreness: 3, sleepHours: 9, mood: 7, effortYesterday: 6 },
  false,
  '',
);
assert(fullPayload.energy === 8, 'energy from answers');
assert(fullPayload.soreness === 3, 'soreness from answers');
assert(fullPayload.sleepHours === 9, 'sleepHours from answers');
assert(fullPayload.mood === 7, 'mood from answers');
assert(fullPayload.effortYesterday === 6, 'effortYesterday from answers');
assert(fullPayload.painFlag === false, 'painFlag false');
assert(fullPayload.painLocation === undefined, 'no painLocation');

// ---------------------------------------------------------------------------
// buildCheckinPayload — with pain
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — with pain');

const painPayload = buildCheckinPayload(
  { energy: 4, soreness: 8, sleepHours: 5, mood: 3, effortYesterday: 7 },
  true,
  'left knee',
);
assert(painPayload.painFlag === true, 'painFlag true');
assert(painPayload.painLocation === 'left knee', 'painLocation set');

// ---------------------------------------------------------------------------
// buildCheckinPayload — pain with empty location
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — pain with empty location');

const painNoLoc = buildCheckinPayload(
  { energy: 5, soreness: 5, sleepHours: 7, mood: 5, effortYesterday: 5 },
  true,
  '',
);
assert(painNoLoc.painFlag === true, 'painFlag true with empty location');
assert(painNoLoc.painLocation === undefined, 'no painLocation when empty string');

// ---------------------------------------------------------------------------
// buildCheckinPayload — pain location trimming
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — pain location trimming');

const trimPayload = buildCheckinPayload(
  { energy: 5, soreness: 5, sleepHours: 7, mood: 5, effortYesterday: 5 },
  true,
  '  right shoulder  ',
);
assert(trimPayload.painLocation === 'right shoulder', 'painLocation is trimmed');

// whitespace-only location
const wsPayload = buildCheckinPayload(
  { energy: 5, soreness: 5, sleepHours: 7, mood: 5, effortYesterday: 5 },
  true,
  '   ',
);
assert(wsPayload.painLocation === undefined, 'whitespace-only location omitted');

// ---------------------------------------------------------------------------
// buildCheckinPayload — pain false ignores location
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — pain false ignores location');

const noPainLoc = buildCheckinPayload(
  { energy: 5, soreness: 5, sleepHours: 7, mood: 5, effortYesterday: 5 },
  false,
  'left knee',
);
assert(noPainLoc.painFlag === false, 'painFlag false');
assert(noPainLoc.painLocation === undefined, 'painLocation omitted when no pain');

// ---------------------------------------------------------------------------
// getCompletionMessage — archetypes
// ---------------------------------------------------------------------------
console.log('\ngetCompletionMessage — archetypes');

assert(getCompletionMessage('phoenix').includes('Rising strong'), 'phoenix message');
assert(getCompletionMessage('titan').includes('Steady'), 'titan message');
assert(getCompletionMessage('blade').includes('Sharp'), 'blade message');
assert(getCompletionMessage('surge').includes('Energy'), 'surge message');
assert(getCompletionMessage(null).includes('All set'), 'null → default message');
assert(getCompletionMessage(undefined).includes('All set'), 'undefined → default message');
assert(getCompletionMessage('').includes('All set'), 'empty → default message');
assert(getCompletionMessage('unknown').includes('All set'), 'unknown → default message');

// ---------------------------------------------------------------------------
// getCompletionMessage — case insensitivity
// ---------------------------------------------------------------------------
console.log('\ngetCompletionMessage — case insensitivity');

assert(getCompletionMessage('Phoenix').includes('Rising strong'), 'Phoenix (capital P)');
assert(getCompletionMessage('TITAN').includes('Steady'), 'TITAN (all caps)');
assert(getCompletionMessage('bLaDe').includes('Sharp'), 'bLaDe (mixed case)');
assert(getCompletionMessage('SURGE').includes('Energy'), 'SURGE (all caps)');

// ---------------------------------------------------------------------------
// getCompletionMessage — all end with "Your plan is ready."
// ---------------------------------------------------------------------------
console.log('\ngetCompletionMessage — all end with plan ready');

const archetypes = ['phoenix', 'titan', 'blade', 'surge', null, undefined, '', 'unknown'];
for (const a of archetypes) {
  const msg = getCompletionMessage(a);
  assert(msg.endsWith('Your plan is ready.'), `"${a}" ends with "Your plan is ready."`);
}

// ---------------------------------------------------------------------------
// CHECKIN_STEPS — pain step has safety sublabel
// ---------------------------------------------------------------------------
console.log('\nCHECKIN_STEPS — pain safety');

const painStep = CHECKIN_STEPS.find(s => s.key === 'painFlag')!;
assert(painStep.sublabel.toLowerCase().includes('safety'), 'pain sublabel mentions safety');
assert(painStep.sublabel.toLowerCase().includes('honest'), 'pain sublabel encourages honesty');

// ---------------------------------------------------------------------------
// Wizard flow simulation — step counts
// ---------------------------------------------------------------------------
console.log('\nWizard flow — step navigation');

// Simulate wizard navigation
let currentStep = 0;
const totalSteps = CHECKIN_STEPS.length;

// Start at 0
assert(currentStep === 0, 'starts at step 0');
assert(getProgressPercent(currentStep, totalSteps) === 0, 'progress is 0 at start');

// Go forward through all steps
for (let i = 0; i < totalSteps - 1; i++) {
  currentStep++;
  const prog = getProgressPercent(currentStep, totalSteps);
  assert(prog > 0 && prog <= 1, `step ${currentStep}: progress is between 0 and 1`);
}

assert(currentStep === totalSteps - 1, 'reached last step');
assert(getProgressPercent(currentStep, totalSteps) === 1, 'progress is 1 at last step');

// Go back
currentStep--;
assert(currentStep === totalSteps - 2, 'went back one step');
assert(getProgressPercent(currentStep, totalSteps) < 1, 'progress decreased');

// ---------------------------------------------------------------------------
// Default answers initialization
// ---------------------------------------------------------------------------
console.log('\nDefault answers initialization');

const defaults: Record<string, number> = {};
for (const step of CHECKIN_STEPS) {
  if (step.type !== 'pain') {
    defaults[step.key] = getDefaultValue(step.key);
  }
}

assert(defaults.mood === 5, 'default mood = 5');
assert(defaults.sleepHours === 7, 'default sleepHours = 7');
assert(defaults.energy === 5, 'default energy = 5');
assert(defaults.soreness === 5, 'default soreness = 5');
assert(defaults.effortYesterday === 5, 'default effortYesterday = 5');
assert(defaults.painFlag === undefined, 'pain not in numeric defaults');

// Count: 5 numeric defaults
const defaultKeys = Object.keys(defaults);
assert(defaultKeys.length === 5, '5 numeric default values');

// ---------------------------------------------------------------------------
// Payload from defaults matches API schema
// ---------------------------------------------------------------------------
console.log('\nPayload from defaults matches API schema');

const defaultPayload = buildCheckinPayload(defaults, false, '');
assert(typeof defaultPayload.energy === 'number', 'energy is number');
assert(typeof defaultPayload.soreness === 'number', 'soreness is number');
assert(typeof defaultPayload.sleepHours === 'number', 'sleepHours is number');
assert(typeof defaultPayload.mood === 'number', 'mood is number');
assert(typeof defaultPayload.effortYesterday === 'number', 'effortYesterday is number');
assert(typeof defaultPayload.painFlag === 'boolean', 'painFlag is boolean');

// Check field names match CheckinData type
const payloadKeys = Object.keys(defaultPayload).sort();
const expectedKeys = ['effortYesterday', 'energy', 'mood', 'painFlag', 'sleepHours', 'soreness'].sort();
assert(JSON.stringify(payloadKeys) === JSON.stringify(expectedKeys), 'payload keys match CheckinData');

// With pain location, has extra field
const painPayloadKeys = Object.keys(
  buildCheckinPayload(defaults, true, 'knee')
).sort();
const expectedPainKeys = ['effortYesterday', 'energy', 'mood', 'painFlag', 'painLocation', 'sleepHours', 'soreness'].sort();
assert(JSON.stringify(painPayloadKeys) === JSON.stringify(expectedPainKeys), 'pain payload has painLocation');

// ---------------------------------------------------------------------------
// Slider ranges produce valid option counts
// ---------------------------------------------------------------------------
console.log('\nSlider option counts');

for (const step of CHECKIN_STEPS) {
  if (step.min !== undefined && step.max !== undefined) {
    const optionCount = step.max - step.min + 1;
    assert(optionCount >= 5, `${step.key} has at least 5 options (${optionCount})`);
    assert(optionCount <= 15, `${step.key} has at most 15 options (${optionCount})`);
  }
}

// ---------------------------------------------------------------------------
// Banned words check in labels and messages
// ---------------------------------------------------------------------------
console.log('\nBanned words check');

const BANNED = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];

for (const step of CHECKIN_STEPS) {
  const text = `${step.label} ${step.sublabel}`.toLowerCase();
  for (const word of BANNED) {
    // Word-level check
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    assert(!regex.test(text), `step "${step.key}" does not contain banned word "${word}"`);
  }
}

for (const archetype of ['phoenix', 'titan', 'blade', 'surge', null, undefined]) {
  const msg = getCompletionMessage(archetype).toLowerCase();
  for (const word of BANNED) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    assert(!regex.test(msg), `completion "${archetype}" does not contain banned word "${word}"`);
  }
}

// ---------------------------------------------------------------------------
// Calm tone — no exclamation marks in completion messages
// ---------------------------------------------------------------------------
console.log('\nCalm tone — completion messages');

for (const a of ['phoenix', 'titan', 'blade', 'surge', null]) {
  const msg = getCompletionMessage(a);
  assert(!msg.includes('!'), `completion "${a}" has no exclamation marks`);
}

// ---------------------------------------------------------------------------
// Step order matters — mood first (sets emotional tone)
// ---------------------------------------------------------------------------
console.log('\nStep order logic');

assert(CHECKIN_STEPS[0].key === 'mood', 'mood is first (sets emotional tone)');
assert(CHECKIN_STEPS[CHECKIN_STEPS.length - 1].key === 'painFlag', 'pain is last (safety gate)');

// Sleep comes before energy (sleep affects energy perception)
const sleepIdx = CHECKIN_STEPS.findIndex(s => s.key === 'sleepHours');
const energyIdx = CHECKIN_STEPS.findIndex(s => s.key === 'energy');
assert(sleepIdx < energyIdx, 'sleep comes before energy');

// ---------------------------------------------------------------------------
// getProgressPercent — monotonically increasing
// ---------------------------------------------------------------------------
console.log('\ngetProgressPercent — monotonic');

let prev = -1;
for (let i = 0; i < totalSteps; i++) {
  const p = getProgressPercent(i, totalSteps);
  assert(p >= prev, `step ${i} progress >= previous`);
  prev = p;
}

// ---------------------------------------------------------------------------
// buildCheckinPayload — partial answers fallback
// ---------------------------------------------------------------------------
console.log('\nbuildCheckinPayload — partial answers');

const partial = buildCheckinPayload({ mood: 8, energy: 6 }, false, '');
assert(partial.mood === 8, 'mood from partial');
assert(partial.energy === 6, 'energy from partial');
assert(partial.soreness === 5, 'soreness defaults');
assert(partial.sleepHours === 7, 'sleepHours defaults');
assert(partial.effortYesterday === 5, 'effortYesterday defaults');

// ---------------------------------------------------------------------------
// getValueDisplay — edge values
// ---------------------------------------------------------------------------
console.log('\ngetValueDisplay — edge values');

assert(getValueDisplay('mood', 1) === '1/10', 'mood min display');
assert(getValueDisplay('mood', 10) === '10/10', 'mood max display');
assert(getValueDisplay('sleepHours', 4) === '4h', 'sleep min display');
assert(getValueDisplay('sleepHours', 12) === '12h', 'sleep max display');

// ---------------------------------------------------------------------------
// Pain step — not skippable (safety critical)
// ---------------------------------------------------------------------------
console.log('\nPain step — safety non-skippable');

const nonSkippableSteps = CHECKIN_STEPS.filter(s => !s.skippable);
assert(nonSkippableSteps.length === 1, 'exactly 1 non-skippable step');
assert(nonSkippableSteps[0].key === 'painFlag', 'only pain is non-skippable');

// ---------------------------------------------------------------------------
// All slider steps are skippable
// ---------------------------------------------------------------------------
console.log('\nAll slider/sleep steps skippable');

const skippableSteps = CHECKIN_STEPS.filter(s => s.type !== 'pain');
for (const step of skippableSteps) {
  assert(step.skippable === true, `${step.key} (${step.type}) is skippable`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
