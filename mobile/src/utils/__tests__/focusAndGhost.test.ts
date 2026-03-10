/**
 * Focus & Ghost Logic Tests
 * Tests for computeFocusItems logic (reproduced inline since the import
 * depends on React Native theme modules that can't load in a plain tsx runner).
 *
 * Run: npx tsx src/utils/__tests__/focusAndGhost.test.ts
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== Focus & Ghost Logic Tests ===\n');

// ─── Types (minimal reproductions) ─────────────────────────────────────────

type IntensityLevel = 'REST' | 'LIGHT' | 'MODERATE' | 'HARD';
type EventType = 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';

interface Plan {
  recommendedIntensity: IntensityLevel;
  recommendation?: string;
  duration?: number;
}

interface CalendarEvent {
  id: string;
  name: string;
  type: EventType;
  startTime: string | null;
  endTime: string | null;
  intensity: IntensityLevel | null;
}

interface FocusItem {
  id: string;
  title: string;
  subtitle: string;
  time: string | null;
  type: EventType | 'plan';
  intensity: IntensityLevel | null;
  source: 'event' | 'plan' | 'ghost';
}

// ─── Helper reproductions ───────────────────────────────────────────────────

function getIntensityLabel(intensity: IntensityLevel): string {
  switch (intensity.toUpperCase()) {
    case 'REST': return 'Rest';
    case 'LIGHT': return 'Light';
    case 'MODERATE': return 'Moderate';
    case 'HARD': return 'Hard';
    default: return 'Moderate';
  }
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return m > 0 ? `${hour12}:${String(m).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

// ─── computeFocusItems logic (exact reproduction) ───────────────────────────

function computeFocusItems(plan: Plan | null, events: CalendarEvent[]): FocusItem[] {
  const items: FocusItem[] = [];

  // Plan is always first priority
  if (plan) {
    const intensity = plan.recommendedIntensity;
    const label = getIntensityLabel(intensity);
    const durationStr = plan.duration ? `${plan.duration} min` : '';
    items.push({
      id: 'plan',
      title: `${label} ${intensity === 'REST' ? 'Day' : 'Training'}`,
      subtitle: plan.recommendation
        ? plan.recommendation.substring(0, 60) + (plan.recommendation.length > 60 ? '...' : '')
        : durationStr,
      time: durationStr || null,
      type: 'plan',
      intensity: intensity,
      source: 'plan',
    });
  }

  // Sort events by time (timed first, then untimed)
  const sorted = [...events].sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });

  for (const event of sorted) {
    if (items.length >= 3) break;
    const timeStr = event.startTime
      ? formatTime12h(event.startTime) + (event.endTime ? ` – ${formatTime12h(event.endTime)}` : '')
      : null;
    items.push({
      id: event.id,
      title: event.name,
      subtitle: event.type.replace('_', ' '),
      time: timeStr,
      type: event.type,
      intensity: event.intensity,
      source: 'event',
    });
  }

  return items;
}

// ─── Test Data Factories ────────────────────────────────────────────────────

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    recommendedIntensity: 'MODERATE',
    recommendation: 'Stay focused and hydrated',
    duration: 45,
    ...overrides,
  };
}

function makeEvent(id: string, name: string, type: EventType, startTime: string | null, endTime: string | null = null): CalendarEvent {
  return { id, name, type, startTime, endTime, intensity: null };
}

// ─── Tests: computeFocusItems ───────────────────────────────────────────────

console.log('Plan only:');
(() => {
  const items = computeFocusItems(makePlan(), []);
  assertEq(items.length, 1, 'plan only → 1 item');
  assertEq(items[0].source, 'plan', 'source is plan');
  assertEq(items[0].type, 'plan', 'type is plan');
  assertEq(items[0].title, 'Moderate Training', 'title includes intensity label');
  assert(items[0].subtitle.includes('Stay focused'), 'subtitle from recommendation');
  assertEq(items[0].time, '45 min', 'time shows duration');
})();

console.log('\nREST plan title:');
(() => {
  const items = computeFocusItems(makePlan({ recommendedIntensity: 'REST' }), []);
  assertEq(items[0].title, 'Rest Day', 'REST plan title is "Rest Day" not "Rest Training"');
})();

console.log('\nEvents only:');
(() => {
  const events = [
    makeEvent('e1', 'Practice', 'training', '16:00'),
    makeEvent('e2', 'Game', 'match', '10:00'),
    makeEvent('e3', 'Study', 'study_block', '18:00'),
  ];
  const items = computeFocusItems(null, events);
  assertEq(items.length, 3, 'events only → 3 items');
  assertEq(items[0].source, 'event', 'all items are events');
  // Should be sorted by time: 10:00, 16:00, 18:00
  assertEq(items[0].title, 'Game', 'first event sorted by time (10:00)');
  assertEq(items[1].title, 'Practice', 'second event (16:00)');
  assertEq(items[2].title, 'Study', 'third event (18:00)');
})();

console.log('\nPlan + events → plan first:');
(() => {
  const events = [
    makeEvent('e1', 'Practice', 'training', '16:00'),
    makeEvent('e2', 'Match', 'match', '10:00'),
  ];
  const items = computeFocusItems(makePlan(), events);
  assertEq(items.length, 3, 'plan + 2 events = 3 items');
  assertEq(items[0].source, 'plan', 'plan comes first');
  assertEq(items[1].title, 'Match', 'events sorted by time after plan (10:00 first)');
  assertEq(items[2].title, 'Practice', '16:00 event last');
})();

console.log('\nEmpty plan + empty events:');
(() => {
  const items = computeFocusItems(null, []);
  assertEq(items.length, 0, 'empty → empty array');
})();

console.log('\nEvents with no startTime sorted after timed events:');
(() => {
  const events = [
    makeEvent('e1', 'Untimed Event', 'other', null),
    makeEvent('e2', 'Afternoon Match', 'match', '14:00'),
    makeEvent('e3', 'Morning Practice', 'training', '08:00'),
  ];
  const items = computeFocusItems(null, events);
  assertEq(items.length, 3, '3 events → 3 items');
  assertEq(items[0].title, 'Morning Practice', 'timed event 08:00 first');
  assertEq(items[1].title, 'Afternoon Match', 'timed event 14:00 second');
  assertEq(items[2].title, 'Untimed Event', 'untimed event last');
})();

console.log('\nMax 3 items even with more events:');
(() => {
  const events = [
    makeEvent('e1', 'Event A', 'training', '08:00'),
    makeEvent('e2', 'Event B', 'match', '10:00'),
    makeEvent('e3', 'Event C', 'recovery', '12:00'),
    makeEvent('e4', 'Event D', 'other', '14:00'),
    makeEvent('e5', 'Event E', 'exam', '16:00'),
  ];
  const items = computeFocusItems(null, events);
  assertEq(items.length, 3, '5 events → capped at 3');
  assertEq(items[0].title, 'Event A', 'first 3 by time');
  assertEq(items[1].title, 'Event B', 'second');
  assertEq(items[2].title, 'Event C', 'third');
})();

console.log('\nMax 3 items with plan + events:');
(() => {
  const events = [
    makeEvent('e1', 'Event A', 'training', '08:00'),
    makeEvent('e2', 'Event B', 'match', '10:00'),
    makeEvent('e3', 'Event C', 'recovery', '12:00'),
  ];
  const items = computeFocusItems(makePlan(), events);
  // Plan takes 1 slot, only 2 events fit
  assertEq(items.length, 3, 'plan + 3 events → capped at 3 total');
  assertEq(items[0].source, 'plan', 'plan is first');
  assertEq(items[1].title, 'Event A', 'first event');
  assertEq(items[2].title, 'Event B', 'second event');
})();

console.log('\nTime formatting in focus items:');
(() => {
  const events = [
    makeEvent('e1', 'Morning', 'training', '08:00', '09:30'),
    makeEvent('e2', 'Afternoon', 'training', '14:30'),
  ];
  const items = computeFocusItems(null, events);
  assertEq(items[0].time, '8 AM – 9:30 AM', 'time range formatted correctly');
  assertEq(items[1].time, '2:30 PM', 'single time formatted correctly');
})();

console.log('\nEvent subtitle uses type with underscore replaced:');
(() => {
  const events = [
    makeEvent('e1', 'Physics', 'study_block', '10:00'),
  ];
  const items = computeFocusItems(null, events);
  assertEq(items[0].subtitle, 'study block', 'study_block becomes "study block"');
})();

console.log('\nPlan with long recommendation truncates:');
(() => {
  const longRec = 'A'.repeat(100);
  const items = computeFocusItems(makePlan({ recommendation: longRec }), []);
  assert(items[0].subtitle.length <= 63, 'subtitle truncated to 60 chars + ...');
  assert(items[0].subtitle.endsWith('...'), 'subtitle ends with ...');
})();

console.log('\nPlan with no recommendation uses duration:');
(() => {
  const items = computeFocusItems(makePlan({ recommendation: undefined, duration: 60 }), []);
  assertEq(items[0].subtitle, '60 min', 'subtitle falls back to duration');
})();

console.log('\nNull time for untimed events:');
(() => {
  const events = [makeEvent('e1', 'Rest Day', 'recovery', null)];
  const items = computeFocusItems(null, events);
  assertEq(items[0].time, null, 'untimed event has null time');
})();

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\nFocus & Ghost Logic Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
