/**
 * useCheckinStatus — Lightweight hook exposing whether today's check-in is done.
 *
 * Calls getToday() on mount + re-fetches on screen focus.
 * Defaults to needsCheckin=true (safe fallback — always show CTA).
 *
 * States:
 *   needsCheckin=true, isStale=false  → No checkin today
 *   needsCheckin=false, isStale=false → Fresh checkin (< 18h)
 *   needsCheckin=false, isStale=true  → Checkin exists but getting old (> 18h)
 *   needsCheckin=true, isStale=false  → New day, no checkin yet
 */

import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getToday } from '../services/api';
import { onRefresh } from '../utils/refreshBus';

/** Hours after which a same-day checkin is considered stale */
const STALE_THRESHOLD_HOURS = 18;

export function useCheckinStatus(): {
  needsCheckin: boolean;
  isStale: boolean;
  checkinAgeHours: number | null;
  refresh: () => void;
} {
  const [needsCheckin, setNeedsCheckin] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [checkinAgeHours, setCheckinAgeHours] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getToday();
      const needs = data.needsCheckin ?? true;
      const age = (data as any).checkinAgeHours as number | null;

      setNeedsCheckin(needs);
      setCheckinAgeHours(age ?? null);

      // Mark as stale if checkin exists but is older than threshold
      if (!needs && age != null && age >= STALE_THRESHOLD_HOURS) {
        setIsStale(true);
      } else {
        setIsStale(false);
      }
    } catch (err) {
      // On error, assume needs check-in (safe fallback)
      console.error('[useCheckinStatus] fetch error:', err);
      setNeedsCheckin(true);
      setIsStale(false);
      setCheckinAgeHours(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Re-check whenever any data refresh fires (e.g. right after checkin submit)
  // so the header icon flips instantly without waiting for screen re-focus.
  useEffect(() => {
    return onRefresh('checkin', refresh);
  }, [refresh]);

  return { needsCheckin, isStale, checkinAgeHours, refresh };
}
