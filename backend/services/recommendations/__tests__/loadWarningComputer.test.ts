/**
 * Unit tests for the Load Warning Recommendation Computer
 */

import { computeLoadWarningRec } from '../computers/loadWarningComputer';
import type { AthleteEvent } from '../../events/types';

// ── Mocks ────────────────────────────────────────────────────────────────

const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
});

let mockSnapshot: Record<string, unknown> | null = null;
let mockDailyLoadCount = 14;

jest.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'athlete_recommendations') {
        return {
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      if (table === 'athlete_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockSnapshot }),
            }),
          }),
        };
      }
      if (table === 'athlete_daily_load') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ count: mockDailyLoadCount }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

let mockPhvResult: { phvStage: string; loadingMultiplier: number } | null = null;

jest.mock('@/services/programs/phvCalculator', () => ({
  getPlayerPHVStage: () => Promise.resolve(mockPhvResult),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AthleteEvent> = {}): AthleteEvent {
  return {
    event_id: 'evt-123',
    athlete_id: 'athlete-456',
    event_type: 'SESSION_LOG',
    occurred_at: new Date().toISOString(),
    source: 'MANUAL',
    payload: {},
    created_by: 'athlete-456',
    created_at: new Date().toISOString(),
    correction_of: null,
    ...overrides,
  } as AthleteEvent;
}

function makeSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    acwr: 1.0,
    atl_7day: 300,
    ctl_28day: 280,
    dual_load_index: 50,
    injury_risk_flag: 'GREEN',
    athletic_load_7day: 300,
    academic_load_7day: 100,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPhvResult = null;
  mockDailyLoadCount = 14;
});

describe('Load Warning Computer', () => {
  test('ACWR > 1.5 → P1 "Training Spike Detected"', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.6, injury_risk_flag: 'RED' });
    await computeLoadWarningRec('athlete-456', makeEvent());

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(1);
    expect(rec.title).toBe('Training Spike Detected');
    expect(rec.rec_type).toBe('LOAD_WARNING');
  });

  test('ACWR > 1.3 → P2 "Load Building Quickly"', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.35 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(2);
    expect(rec.title).toBe('Load Building Quickly');
  });

  test('ACWR < 0.8 with training history → P3 "Detraining Risk"', async () => {
    mockSnapshot = makeSnapshot({ acwr: 0.7, ctl_28day: 250 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(3);
    expect(rec.title).toBe('Detraining Risk');
  });

  test('ACWR < 0.8 with no training history → no rec created', async () => {
    mockSnapshot = makeSnapshot({ acwr: 0.7, ctl_28day: 0 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('dual_load_index > 80 → P2 "Combined Load High"', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.1, dual_load_index: 85 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(2);
    expect(rec.title).toBe('Combined Load High');
  });

  test('mid_phv + ACWR > 1.2 → P1 "Growth Phase Load Alert" (lower threshold)', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.25 });
    mockPhvResult = { phvStage: 'mid_phv', loadingMultiplier: 0.6 };

    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(1);
    expect(rec.title).toBe('Growth Phase Load Alert');
  });

  test('Safe zone (ACWR 0.8-1.3, dual_load < 80) → no rec created', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.0, dual_load_index: 50 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('≥14 days data → confidence 0.85', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.6 });
    mockDailyLoadCount = 20;

    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.confidence_score).toBe(0.85);
  });

  test('7-13 days data → confidence 0.65', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.6 });
    mockDailyLoadCount = 10;

    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.confidence_score).toBe(0.65);
  });

  test('<7 days data → confidence 0.45', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.6 });
    mockDailyLoadCount = 3;

    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.confidence_score).toBe(0.45);
  });

  test('No snapshot → skips without error', async () => {
    mockSnapshot = null;
    await computeLoadWarningRec('athlete-456', makeEvent());
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('No ACWR and no dual load → skips', async () => {
    mockSnapshot = makeSnapshot({ acwr: null, dual_load_index: null });
    await computeLoadWarningRec('athlete-456', makeEvent());
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('Sets expires_at to 48 hours from now', async () => {
    mockSnapshot = makeSnapshot({ acwr: 1.6 });
    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    const expiresAt = new Date(rec.expires_at).getTime();
    const expectedMin = Date.now() + 47 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 49 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  test('mid_phv takes priority over ACWR > 1.5', async () => {
    // ACWR is 1.6 (would normally be "Training Spike") but mid_phv + >1.2 matches first
    mockSnapshot = makeSnapshot({ acwr: 1.6 });
    mockPhvResult = { phvStage: 'mid_phv', loadingMultiplier: 0.6 };

    await computeLoadWarningRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.title).toBe('Growth Phase Load Alert');
  });
});
