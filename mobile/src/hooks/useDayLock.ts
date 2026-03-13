/**
 * useDayLock — Hook to manage day lock state for the calendar.
 *
 * Fetches lock status from backend, provides toggle function.
 * Only active when isOwner is true (player viewing their own calendar).
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getDayLockStatus, lockDay, unlockDay } from '../services/api';

interface UseDayLockReturn {
  isLocked: boolean;
  isLoading: boolean;
  toggleLock: () => Promise<void>;
}

export function useDayLock(date: string, isOwner: boolean): UseDayLockReturn {
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOwner || !date) return;

    let cancelled = false;
    setIsLoading(true);

    getDayLockStatus(date)
      .then((res) => {
        if (!cancelled) setIsLocked(res.locked);
      })
      .catch(() => {
        // silent — default to unlocked
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, isOwner]);

  const toggleLock = useCallback(async () => {
    if (!isOwner) return;

    try {
      if (isLocked) {
        await unlockDay(date);
        setIsLocked(false);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else {
        await lockDay(date);
        setIsLocked(true);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch {
      // silent — could show toast
    }
  }, [date, isOwner, isLocked]);

  return { isLocked, isLoading, toggleLock };
}
