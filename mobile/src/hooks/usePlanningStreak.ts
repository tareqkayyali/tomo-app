/**
 * usePlanningStreak — Tracks consecutive days the athlete confirms their morning plan.
 *
 * Stores:
 *   @tomo_planning_streak          → JSON { currentStreak, lastConfirmedDate }
 *   @tomo_morning_swipe_{YYYY-MM-DD} → 'true' when that day has been confirmed
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_PLANNING_STREAK, STORAGE_KEY_MORNING_SWIPE_PREFIX } from '../constants/storageKeys';

// ─── Storage Keys ──────────────────────────────────────────────────────────

const STREAK_KEY = STORAGE_KEY_PLANNING_STREAK;
const MORNING_SWIPE_PREFIX = STORAGE_KEY_MORNING_SWIPE_PREFIX;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Return today's date as "YYYY-MM-DD" in local time. */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return yesterday's date as "YYYY-MM-DD" in local time. */
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Persisted Shape ───────────────────────────────────────────────────────

interface StreakData {
  currentStreak: number;
  lastConfirmedDate: string | null;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UsePlanningStreakReturn {
  /** Current streak count (0 if none). */
  streak: number;
  /** Whether the user has already confirmed today. */
  confirmedToday: boolean;
  /** Call to mark today as confirmed and update the streak. */
  confirmToday: () => Promise<void>;
  /** True once initial data has been loaded from AsyncStorage. */
  isLoaded: boolean;
}

export function usePlanningStreak(): UsePlanningStreakReturn {
  const [streak, setStreak] = useState(0);
  const [confirmedToday, setConfirmedToday] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Load on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [streakJson, todayFlag] = await Promise.all([
          AsyncStorage.getItem(STREAK_KEY),
          AsyncStorage.getItem(`${MORNING_SWIPE_PREFIX}${todayStr()}`),
        ]);

        if (cancelled) return;

        if (streakJson) {
          const data: StreakData = JSON.parse(streakJson);
          setStreak(data.currentStreak);
        }

        setConfirmedToday(todayFlag === 'true');
      } catch {
        // Silently fall back to defaults
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Confirm today ──────────────────────────────────────────────────────

  const confirmToday = useCallback(async () => {
    const today = todayStr();

    // Already confirmed — no-op
    const alreadyDone = await AsyncStorage.getItem(
      `${MORNING_SWIPE_PREFIX}${today}`,
    );
    if (alreadyDone === 'true') return;

    // Load current streak data
    let data: StreakData = { currentStreak: 0, lastConfirmedDate: null };
    try {
      const raw = await AsyncStorage.getItem(STREAK_KEY);
      if (raw) data = JSON.parse(raw);
    } catch {
      // use defaults
    }

    // Determine new streak value
    const yesterday = yesterdayStr();
    let newStreak: number;

    if (data.lastConfirmedDate === yesterday) {
      // Consecutive day — extend the streak
      newStreak = data.currentStreak + 1;
    } else if (data.lastConfirmedDate === today) {
      // Redundant call within the same day (safety guard)
      newStreak = data.currentStreak;
    } else {
      // Gap detected — reset streak to 1
      newStreak = 1;
    }

    const updated: StreakData = {
      currentStreak: newStreak,
      lastConfirmedDate: today,
    };

    // Persist
    await Promise.all([
      AsyncStorage.setItem(STREAK_KEY, JSON.stringify(updated)),
      AsyncStorage.setItem(`${MORNING_SWIPE_PREFIX}${today}`, 'true'),
    ]);

    setStreak(newStreak);
    setConfirmedToday(true);
  }, []);

  return { streak, confirmedToday, confirmToday, isLoaded };
}
