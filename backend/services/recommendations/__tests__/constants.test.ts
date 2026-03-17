/**
 * Unit tests for the RIE constants and EVENT_TO_REC_TYPES routing table
 */

import { EVENT_TO_REC_TYPES, REC_EXPIRY_HOURS } from '../constants';
import { EVENT_TYPES, VALID_EVENT_TYPES } from '../../events/constants';

describe('EVENT_TO_REC_TYPES routing table', () => {
  test('all keys are valid EVENT_TYPES', () => {
    for (const key of Object.keys(EVENT_TO_REC_TYPES)) {
      expect(VALID_EVENT_TYPES.has(key)).toBe(true);
    }
  });

  test('WELLNESS_CHECKIN → [READINESS]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.WELLNESS_CHECKIN]).toEqual(['READINESS']);
  });

  test('SESSION_LOG → [LOAD_WARNING, READINESS]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.SESSION_LOG]).toEqual(['LOAD_WARNING', 'READINESS']);
  });

  test('VITAL_READING → [READINESS]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.VITAL_READING]).toEqual(['READINESS']);
  });

  test('WEARABLE_SYNC → [READINESS]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.WEARABLE_SYNC]).toEqual(['READINESS']);
  });

  test('SLEEP_RECORD → [READINESS]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.SLEEP_RECORD]).toEqual(['READINESS']);
  });

  test('COMPETITION_RESULT → [LOAD_WARNING]', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.COMPETITION_RESULT]).toEqual(['LOAD_WARNING']);
  });

  test('Phase B events have empty arrays', () => {
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.ACADEMIC_EVENT]).toEqual([]);
    expect(EVENT_TO_REC_TYPES[EVENT_TYPES.ASSESSMENT_RESULT]).toEqual([]);
  });

  test('all rec type arrays contain only valid RecType values', () => {
    const validRecTypes = [
      'READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT',
      'ACADEMIC', 'CV_OPPORTUNITY', 'TRIANGLE_ALERT', 'MOTIVATION',
    ];

    for (const [, recTypes] of Object.entries(EVENT_TO_REC_TYPES)) {
      for (const rt of recTypes!) {
        expect(validRecTypes).toContain(rt);
      }
    }
  });
});

describe('REC_EXPIRY_HOURS', () => {
  test('READINESS expires in 24 hours', () => {
    expect(REC_EXPIRY_HOURS.READINESS).toBe(24);
  });

  test('LOAD_WARNING expires in 48 hours', () => {
    expect(REC_EXPIRY_HOURS.LOAD_WARNING).toBe(48);
  });
});
