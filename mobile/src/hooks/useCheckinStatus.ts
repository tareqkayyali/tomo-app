/**
 * useCheckinStatus — Lightweight hook exposing whether today's check-in is done.
 *
 * Calls getToday() on mount + re-fetches on screen focus.
 * Defaults to needsCheckin=true (safe fallback — always show CTA).
 */

import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getToday } from '../services/api';

export function useCheckinStatus(): { needsCheckin: boolean; refresh: () => void } {
  const [needsCheckin, setNeedsCheckin] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getToday();
      setNeedsCheckin(data.needsCheckin);
    } catch {
      // On error, assume needs check-in (safe fallback)
      setNeedsCheckin(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { needsCheckin, refresh };
}
