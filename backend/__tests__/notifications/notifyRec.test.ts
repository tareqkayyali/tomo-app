/**
 * Unit tests for insertRecommendationWithNotify.
 *
 * Verifies the subtle-defaults invariant:
 *   - P1/P2 recs DO fire a NEW_RECOMMENDATION notification
 *   - P3+ recs do NOT fire (stay silent in dashboard)
 *   - Insert failure short-circuits — no notification attempt
 */

import { insertRecommendationWithNotify } from '@/services/recommendations/notifyRec';
import type { RecommendationInsert } from '@/services/recommendations/types';

// Capture calls to createNotification from the dynamically-imported engine.
// The mock path must match what notifyRec.ts imports (a relative path).
const createNotificationMock = jest.fn();
jest.mock('@/services/notifications/notificationEngine', () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
}));
jest.mock('../../services/notifications/notificationEngine', () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
}), { virtual: true });

function makeDb(insertResult: { data: { id: string } | null; error: unknown }) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => insertResult,
        }),
      }),
    }),
  };
}

function makeRec(priority: 1 | 2 | 3 | 4): RecommendationInsert {
  return {
    athlete_id: 'a-1',
    rec_type: 'READINESS',
    priority,
    title: 'Test rec',
    body_short: 'body',
    confidence_score: 0.9,
    evidence_basis: {},
    context: {},
    expires_at: '2030-01-01T00:00:00Z',
  };
}

// Wait a tick so the fire-and-forget dynamic import settles.
const flush = () => new Promise((r) => setTimeout(r, 10));

describe('insertRecommendationWithNotify', () => {
  beforeEach(() => createNotificationMock.mockReset());

  it('fires NEW_RECOMMENDATION for P1', async () => {
    const db = makeDb({ data: { id: 'rec-p1' }, error: null });
    const id = await insertRecommendationWithNotify(db as any, makeRec(1));
    await flush();
    expect(id).toBe('rec-p1');
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 'a-1',
        type: 'NEW_RECOMMENDATION',
        vars: expect.objectContaining({ priority: 1, rec_id: 'rec-p1' }),
      }),
    );
  });

  it('fires NEW_RECOMMENDATION for P2', async () => {
    const db = makeDb({ data: { id: 'rec-p2' }, error: null });
    await insertRecommendationWithNotify(db as any, makeRec(2));
    await flush();
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent for P3 (Tomorrow)', async () => {
    const db = makeDb({ data: { id: 'rec-p3' }, error: null });
    await insertRecommendationWithNotify(db as any, makeRec(3));
    await flush();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('stays silent for P4 (motivation)', async () => {
    const db = makeDb({ data: { id: 'rec-p4' }, error: null });
    await insertRecommendationWithNotify(db as any, makeRec(4));
    await flush();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns null and skips notification on insert error', async () => {
    const db = makeDb({ data: null, error: { message: 'boom' } });
    const id = await insertRecommendationWithNotify(db as any, makeRec(1));
    await flush();
    expect(id).toBeNull();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});
