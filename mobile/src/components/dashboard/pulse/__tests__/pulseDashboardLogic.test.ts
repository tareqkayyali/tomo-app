/**
 * Unit tests for Pulse dashboard pure logic (Node assert, no Jest).
 *
 * From repo root: `npx tsx mobile/src/components/dashboard/pulse/__tests__/pulseDashboardLogic.test.ts`
 * From mobile/:   `npm run test:pulse-logic` or `npx tsx src/components/dashboard/pulse/__tests__/pulseDashboardLogic.test.ts`
 * (Do not use `mobile/src/...` when cwd is already `mobile/` — that doubles the path.)
 */
import assert from 'assert';
import {
  bucketPercentile,
  acwrZone,
  computeAcwrFromDailyLoad,
  getPulseVitalsEmptyState,
  hasAnyVitalsSeries,
  ordinalPercentile,
} from '../pulseDashboardLogic';
import { buildMetricChipBuckets } from '../pulseDashboardWiring';

function testOrdinal() {
  assert.strictEqual(ordinalPercentile(92), '92nd');
  assert.strictEqual(ordinalPercentile(1), '1st');
  assert.strictEqual(ordinalPercentile(11), '11th');
}

function testBucket() {
  assert.strictEqual(bucketPercentile(100), 'strong');
  assert.strictEqual(bucketPercentile(75), 'strong');
  assert.strictEqual(bucketPercentile(74), 'holding');
  assert.strictEqual(bucketPercentile(40), 'holding');
  assert.strictEqual(bucketPercentile(39), 'watch');
  assert.strictEqual(bucketPercentile(0), 'watch');
}

function testAcwrZone() {
  assert.strictEqual(acwrZone(0.79), 'detrain');
  assert.strictEqual(acwrZone(0.8), 'optimal');
  assert.strictEqual(acwrZone(1.0), 'optimal');
  assert.strictEqual(acwrZone(1.3), 'optimal');
  assert.strictEqual(acwrZone(1.3000001), 'risk');
  assert.strictEqual(acwrZone(2), 'risk');
}

function testAcwrFromLoad() {
  const uniform = Array.from({ length: 28 }, () => ({ trainingLoadAu: 10 }));
  assert.strictEqual(computeAcwrFromDailyLoad(uniform), 1);
  const acuteHigh = [
    ...Array.from({ length: 7 }, () => ({ trainingLoadAu: 20 })),
    ...Array.from({ length: 21 }, () => ({ trainingLoadAu: 10 })),
  ];
  const r = computeAcwrFromDailyLoad(acuteHigh);
  assert.ok(r > 1, `expected ACWR > 1, got ${r}`);
}

function testEmptyStateSnapshot() {
  const s = getPulseVitalsEmptyState();
  assert.deepStrictEqual(s, {
    title: 'Log your first vitals',
    body: 'Wearable sync or check-in unlocks HRV, sleep, and readiness trends here.',
  });
  // Regression "snapshot" — update intentionally if copy changes
  assert.strictEqual(
    JSON.stringify(s),
    '{"title":"Log your first vitals","body":"Wearable sync or check-in unlocks HRV, sleep, and readiness trends here."}',
  );
}

function testHasAnyVitals() {
  assert.strictEqual(
    hasAnyVitalsSeries([null, 40], [7, 8], [null, null]),
    true,
  );
  assert.strictEqual(
    hasAnyVitalsSeries([null, null], [null, null], [null, null]),
    false,
  );
}

function testMetricBuckets() {
  const out = buildMetricChipBuckets({
    vitals: {} as any,
    metrics: {
      categories: [
        {
          category: 'x',
          groupId: 'g',
          emoji: '',
          colorTheme: 'green',
          priority: 1,
          athleteDescription: '',
          metrics: [
            { metricKey: 'a', metricLabel: 'A', unit: 's', direction: 'lower_better', value: 1, percentile: 80, zone: 'good', ageBand: '', position: '', competitionLvl: '', norm: {} as any, message: '' },
            { metricKey: 'b', metricLabel: 'B', unit: 's', direction: 'higher_better', value: 2, percentile: 50, zone: 'average', ageBand: '', position: '', competitionLvl: '', norm: {} as any, message: '' },
            { metricKey: 'c', metricLabel: 'C', unit: 's', direction: 'higher_better', value: 3, percentile: 20, zone: 'developing', ageBand: '', position: '', competitionLvl: '', norm: {} as any, message: '' },
          ],
          categoryAvgPercentile: 50,
          categorySummary: '',
        },
      ],
      radarProfile: [],
      strengths: [],
      gaps: [],
      overallPercentile: null,
    },
    programs: {} as any,
  } as any);
  assert.strictEqual(out.strong.length, 1);
  assert.strictEqual(out.holding.length, 1);
  assert.strictEqual(out.watch.length, 1);
}

(() => {
  testOrdinal();
  testBucket();
  testAcwrZone();
  testAcwrFromLoad();
  testEmptyStateSnapshot();
  testHasAnyVitals();
  testMetricBuckets();
  // eslint-disable-next-line no-console
  console.log('pulseDashboardLogic.test.ts: all passed');
})();
