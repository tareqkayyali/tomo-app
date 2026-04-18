/**
 * Purge-planner unit tests.
 *
 * The planner is a pure function, so this suite runs with ts-jest
 * without any Supabase or fetch mocks. It covers:
 *
 *   • jurisdiction → grace-period mapping (GDPR=30, CCPA=45, PDPL=90)
 *   • CUSTOM grace override bounds
 *   • input validation (UUID shape, NIL sentinel refusal)
 *   • plan ordering (ANONYMISE + RELATIONSHIP before CASCADE_DELETE)
 *   • every expected user-scoped table is listed exactly once
 *   • categorisation correctness for audit vs content tables
 *   • counts summary consistency
 *   • isTableCovered introspection helper
 *
 * Intentionally does NOT assert against the full table-graph count —
 * that would be a brittle snapshot test. Instead it asserts invariants
 * (all audit tables are ANONYMISE, all content tables are CASCADE).
 */

import {
  buildPurgePlan,
  gracePeriodFor,
  listCascadeDeleteTables,
  listAnonymiseTables,
  listRelationshipTables,
  isTableCovered,
  DELETION_CONSTANTS,
  type PurgePlanEntry,
} from '../../services/deletion/purgePlanner';

const VALID_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const NIL_USER_ID = '00000000-0000-0000-0000-000000000000';

describe('buildPurgePlan — input validation', () => {
  it('rejects a non-UUID userId', () => {
    expect(() => buildPurgePlan('not-a-uuid')).toThrow(/invalid userId/);
  });

  it('rejects an empty userId', () => {
    expect(() => buildPurgePlan('')).toThrow(/invalid userId/);
  });

  it('rejects the NIL sentinel UUID', () => {
    expect(() => buildPurgePlan(NIL_USER_ID)).toThrow(/NIL sentinel/);
  });

  it('accepts uppercase UUIDs', () => {
    const upper = VALID_USER_ID.toUpperCase();
    expect(() => buildPurgePlan(upper)).not.toThrow();
  });
});

describe('buildPurgePlan — jurisdiction & grace period', () => {
  it('defaults to GDPR with 30-day grace', () => {
    const plan = buildPurgePlan(VALID_USER_ID);
    expect(plan.jurisdiction).toBe('GDPR');
    expect(plan.gracePeriodDays).toBe(30);
  });

  it('maps CCPA to 45-day grace', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { jurisdiction: 'CCPA' });
    expect(plan.gracePeriodDays).toBe(45);
  });

  it('maps PDPL to 90-day grace', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { jurisdiction: 'PDPL' });
    expect(plan.gracePeriodDays).toBe(90);
  });

  it('honours CUSTOM override when supplied', () => {
    const plan = buildPurgePlan(VALID_USER_ID, {
      jurisdiction: 'CUSTOM',
      customGraceDays: 7,
    });
    expect(plan.gracePeriodDays).toBe(7);
  });

  it('falls back to 30-day CUSTOM default when override omitted', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { jurisdiction: 'CUSTOM' });
    expect(plan.gracePeriodDays).toBe(30);
  });

  it('rejects negative CUSTOM grace', () => {
    expect(() =>
      gracePeriodFor('CUSTOM', -5)
    ).toThrow(/out of range/);
  });

  it('rejects excessive CUSTOM grace (>1 year)', () => {
    expect(() =>
      gracePeriodFor('CUSTOM', 500)
    ).toThrow(/out of range/);
  });

  it('allows 0-day CUSTOM grace (regulator fast-track)', () => {
    expect(gracePeriodFor('CUSTOM', 0)).toBe(0);
  });
});

describe('buildPurgePlan — method', () => {
  it('defaults to user_self_service', () => {
    const plan = buildPurgePlan(VALID_USER_ID);
    expect(plan.method).toBe('user_self_service');
  });

  it('accepts admin_forced', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { method: 'admin_forced' });
    expect(plan.method).toBe('admin_forced');
  });

  it('accepts parent_revocation', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { method: 'parent_revocation' });
    expect(plan.method).toBe('parent_revocation');
  });

  it('accepts regulator_request', () => {
    const plan = buildPurgePlan(VALID_USER_ID, { method: 'regulator_request' });
    expect(plan.method).toBe('regulator_request');
  });
});

describe('buildPurgePlan — ordering invariants', () => {
  const plan = buildPurgePlan(VALID_USER_ID);

  it('places all ANONYMISE entries before any CASCADE_DELETE entry', () => {
    const firstCascade = plan.entries.findIndex(
      (e) => e.action === 'CASCADE_DELETE'
    );
    const lastAnonymise = plan.entries.reduce(
      (acc, e, i) => (e.action === 'ANONYMISE' ? i : acc),
      -1
    );
    expect(firstCascade).toBeGreaterThan(-1);
    expect(lastAnonymise).toBeLessThan(firstCascade);
  });

  it('places all RELATIONSHIP entries before any CASCADE_DELETE entry', () => {
    const firstCascade = plan.entries.findIndex(
      (e) => e.action === 'CASCADE_DELETE'
    );
    const lastRelationship = plan.entries.reduce(
      (acc, e, i) => (e.action === 'RELATIONSHIP' ? i : acc),
      -1
    );
    if (lastRelationship >= 0) {
      expect(lastRelationship).toBeLessThan(firstCascade);
    }
  });
});

describe('buildPurgePlan — counts', () => {
  it('counts sum to total entries', () => {
    const plan = buildPurgePlan(VALID_USER_ID);
    const sum =
      plan.counts.cascadeDelete +
      plan.counts.anonymise +
      plan.counts.relationship +
      plan.counts.skip;
    expect(sum).toBe(plan.entries.length);
  });

  it('has at least one cascade, one anonymise, and one relationship entry', () => {
    const plan = buildPurgePlan(VALID_USER_ID);
    expect(plan.counts.cascadeDelete).toBeGreaterThan(0);
    expect(plan.counts.anonymise).toBeGreaterThan(0);
    expect(plan.counts.relationship).toBeGreaterThan(0);
  });
});

describe('buildPurgePlan — table graph completeness', () => {
  const plan = buildPurgePlan(VALID_USER_ID);

  it('includes core athlete content tables (CASCADE_DELETE)', () => {
    const expected = [
      'public.checkins',
      'public.plans',
      'public.calendar_events',
      'public.chat_messages',
      'public.chat_sessions',
      'public.health_data',
      'public.sleep_logs',
      'public.video_test_results',
      'public.points_ledger',
      'public.milestones',
      'public.wearable_connections',
      'public.athlete_snapshots',
      'public.athlete_events',
      'public.athlete_recommendations',
    ];
    for (const t of expected) {
      const hit = plan.entries.find(
        (e) => e.table === t && e.action === 'CASCADE_DELETE'
      );
      expect(hit).toBeDefined();
    }
  });

  it('includes audit/telemetry tables as ANONYMISE', () => {
    const expected = [
      'public.safety_audit_log',
      'public.chat_quality_scores',
      'public.ai_trace_log',
      'public.prompt_shadow_runs',
    ];
    for (const t of expected) {
      const hit = plan.entries.find(
        (e) => e.table === t && e.action === 'ANONYMISE'
      );
      expect(hit).toBeDefined();
    }
  });

  it('includes relationships (both sides) as RELATIONSHIP', () => {
    const relEntries = plan.entries.filter(
      (e) => e.table === 'public.relationships' && e.action === 'RELATIONSHIP'
    );
    expect(relEntries).toHaveLength(2);
    const columns = relEntries.map((e) => e.column).sort();
    expect(columns).toEqual(['guardian_id', 'player_id']);
  });

  it('never marks an audit table as CASCADE_DELETE', () => {
    const auditTables = new Set<string>([
      'public.safety_audit_log',
      'public.chat_quality_scores',
      'public.ai_trace_log',
      'public.prompt_shadow_runs',
    ]);
    for (const e of plan.entries) {
      if (auditTables.has(e.table)) {
        expect(e.action).toBe('ANONYMISE');
      }
    }
  });

  it('never marks core content as ANONYMISE', () => {
    const contentTables = new Set<string>([
      'public.checkins',
      'public.plans',
      'public.calendar_events',
      'public.chat_messages',
      'public.health_data',
    ]);
    for (const e of plan.entries) {
      if (contentTables.has(e.table)) {
        expect(e.action).toBe('CASCADE_DELETE');
      }
    }
  });

  it('has no duplicate (table, column, action) triples', () => {
    const seen = new Set<string>();
    for (const e of plan.entries) {
      const key = `${e.table}::${e.column}::${e.action}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('uses only qualified public.* table names (or auth.*)', () => {
    for (const e of plan.entries) {
      expect(e.table.startsWith('public.') || e.table.startsWith('auth.')).toBe(true);
    }
  });

  it('every entry has a non-empty reason', () => {
    for (const e of plan.entries) {
      expect(typeof e.reason).toBe('string');
      expect(e.reason.length).toBeGreaterThan(5);
    }
  });

  it('every entry has a known action', () => {
    const allowed: PurgePlanEntry['action'][] = [
      'CASCADE_DELETE',
      'ANONYMISE',
      'RELATIONSHIP',
      'SKIP',
    ];
    for (const e of plan.entries) {
      expect(allowed).toContain(e.action);
    }
  });
});

describe('introspection helpers', () => {
  it('listCascadeDeleteTables returns non-empty list', () => {
    expect(listCascadeDeleteTables().length).toBeGreaterThan(10);
  });

  it('listAnonymiseTables returns the four known audit tables minimum', () => {
    const tables = listAnonymiseTables();
    expect(tables).toEqual(
      expect.arrayContaining([
        'public.safety_audit_log',
        'public.chat_quality_scores',
        'public.ai_trace_log',
        'public.prompt_shadow_runs',
      ])
    );
  });

  it('listRelationshipTables contains relationships twice (both sides)', () => {
    const tables = listRelationshipTables();
    const rels = tables.filter((t) => t === 'public.relationships');
    expect(rels).toHaveLength(2);
  });

  it('isTableCovered is true for a known cascade table (bare name)', () => {
    expect(isTableCovered('checkins')).toBe(true);
  });

  it('isTableCovered is true for a known cascade table (qualified)', () => {
    expect(isTableCovered('public.checkins')).toBe(true);
  });

  it('isTableCovered is true for an audit table', () => {
    expect(isTableCovered('safety_audit_log')).toBe(true);
  });

  it('isTableCovered is false for an unknown table', () => {
    expect(isTableCovered('not_a_real_table')).toBe(false);
  });
});

describe('DELETION_CONSTANTS', () => {
  it('exposes the NIL sentinel UUID', () => {
    expect(DELETION_CONSTANTS.SENTINEL_NIL_UUID).toBe(NIL_USER_ID);
  });

  it('exposes jurisdiction list', () => {
    expect(DELETION_CONSTANTS.JURISDICTIONS).toEqual([
      'GDPR',
      'CCPA',
      'PDPL',
      'CUSTOM',
    ]);
  });

  it('exposes method list', () => {
    expect(DELETION_CONSTANTS.METHODS).toEqual([
      'user_self_service',
      'admin_forced',
      'parent_revocation',
      'regulator_request',
    ]);
  });

  it('exposes grace-period map matching gracePeriodFor', () => {
    expect(DELETION_CONSTANTS.GRACE_PERIOD_DAYS.GDPR).toBe(gracePeriodFor('GDPR'));
    expect(DELETION_CONSTANTS.GRACE_PERIOD_DAYS.CCPA).toBe(gracePeriodFor('CCPA'));
    expect(DELETION_CONSTANTS.GRACE_PERIOD_DAYS.PDPL).toBe(gracePeriodFor('PDPL'));
  });
});

describe('plan determinism', () => {
  it('returns identical entries for two calls with same inputs', () => {
    const a = buildPurgePlan(VALID_USER_ID, { jurisdiction: 'GDPR' });
    const b = buildPurgePlan(VALID_USER_ID, { jurisdiction: 'GDPR' });
    expect(a.entries).toEqual(b.entries);
    expect(a.counts).toEqual(b.counts);
  });

  it('plan content does not depend on userId value', () => {
    const otherUuid = '11111111-2222-3333-4444-555555555555';
    const a = buildPurgePlan(VALID_USER_ID);
    const b = buildPurgePlan(otherUuid);
    expect(a.entries).toEqual(b.entries);
  });
});
