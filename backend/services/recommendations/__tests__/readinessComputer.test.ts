/**
 * Unit tests for the Readiness Recommendation Computer
 */

import { computeReadinessRec } from '../computers/readinessComputer';
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
    event_type: 'WELLNESS_CHECKIN',
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
    readiness_rag: 'GREEN',
    readiness_score: 75,
    acwr: 1.0,
    atl_7day: 300,
    ctl_28day: 280,
    dual_load_index: 50,
    sleep_quality: 7,
    last_checkin_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPhvResult = null;
});

describe('Readiness Computer', () => {
  test('RED readiness → P1 "Rest Day Recommended"', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'RED' });
    await computeReadinessRec('athlete-456', makeEvent());

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(1);
    expect(rec.title).toBe('Rest Day Recommended');
    expect(rec.rec_type).toBe('READINESS');
  });

  test('RED + mid_phv → P1 "Rest Day — Growth Phase"', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'RED' });
    mockPhvResult = { phvStage: 'mid_phv', loadingMultiplier: 0.6 };

    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(1);
    expect(rec.title).toBe('Rest Day — Growth Phase');
    expect(rec.body_long).toContain('growth');
  });

  test('AMBER + ACWR > 1.3 → P1 compound risk', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'AMBER', acwr: 1.4 });
    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(1);
    expect(rec.title).toBe('High Load + Low Readiness');
  });

  test('AMBER → P2 "Light Session Suggested"', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'AMBER', acwr: 1.0 });
    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(2);
    expect(rec.title).toBe('Light Session Suggested');
  });

  test('GREEN + mid_phv → P2 "Ready but Modified"', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'GREEN' });
    mockPhvResult = { phvStage: 'mid_phv', loadingMultiplier: 0.6 };

    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(2);
    expect(rec.title).toBe('Ready but Modified');
  });

  test('GREEN → P3 "Ready for High Intensity"', async () => {
    mockSnapshot = makeSnapshot({ readiness_rag: 'GREEN' });
    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.priority).toBe(3);
    expect(rec.title).toBe('Ready for High Intensity');
  });

  test('Stale data (>24h) → confidence 0.5', async () => {
    const staleDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    mockSnapshot = makeSnapshot({ last_checkin_at: staleDate });

    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.confidence_score).toBe(0.5);
  });

  test('Recent checkin → confidence 0.9', async () => {
    mockSnapshot = makeSnapshot({ last_checkin_at: new Date().toISOString() });
    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.confidence_score).toBe(0.9);
  });

  test('No snapshot → skips without error', async () => {
    mockSnapshot = null;
    await computeReadinessRec('athlete-456', makeEvent());
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('Sets expires_at to 24 hours from now', async () => {
    mockSnapshot = makeSnapshot();
    await computeReadinessRec('athlete-456', makeEvent());

    const rec = mockInsert.mock.calls[0][0];
    const expiresAt = new Date(rec.expires_at).getTime();
    const expectedMin = Date.now() + 23 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 25 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  test('Includes trigger_event_id from source event', async () => {
    mockSnapshot = makeSnapshot();
    await computeReadinessRec('athlete-456', makeEvent({ event_id: 'evt-xyz' }));

    const rec = mockInsert.mock.calls[0][0];
    expect(rec.trigger_event_id).toBe('evt-xyz');
  });
});
