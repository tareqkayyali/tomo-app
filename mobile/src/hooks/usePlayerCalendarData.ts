/**
 * usePlayerCalendarData — Fetch another user's calendar (for coach/parent).
 *
 * Lightweight variant of useCalendarData that only fetches events
 * (no plan, no checkins, no delete). Also fetches day lock status.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { getCoachPlayerCalendar, getChildCalendar } from '../services/api';
import { toDateStr, addDays } from '../utils/calendarHelpers';
import type { CalendarEvent } from '../types';

interface PlayerCalendarState {
  events: CalendarEvent[];
  selectedDate: Date;
  isLoading: boolean;
  backendError: boolean;
  dayLocks: Record<string, boolean>;
}

interface PlayerCalendarActions {
  setSelectedDate: (date: Date) => void;
  refresh: () => void;
}

export type PlayerCalendarData = PlayerCalendarState & PlayerCalendarActions;

export function usePlayerCalendarData(
  targetUserId: string,
  callerRole: 'coach' | 'parent',
): PlayerCalendarData {
  const [selectedDate, setSelectedDateRaw] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);
  const [dayLocks, setDayLocks] = useState<Record<string, boolean>>({});

  const isFocused = useIsFocused();
  const cacheRef = useRef<Record<string, { events: CalendarEvent[]; dayLocks: Record<string, boolean> }>>({});
  const wasFocusedRef = useRef(true);

  // ─── Fetch events for the selected day ───────────────────────────

  const loadData = useCallback(
    async (date: Date) => {
      if (!targetUserId) return;
      setIsLoading(true);
      setBackendError(false);

      try {
        const ds = toDateStr(date);
        const cacheKey = ds;

        if (cacheRef.current[cacheKey]) {
          const cached = cacheRef.current[cacheKey];
          setEvents(cached.events);
          setDayLocks((prev) => ({ ...prev, ...cached.dayLocks }));
          setIsLoading(false);
          return;
        }

        const fetcher =
          callerRole === 'coach' ? getCoachPlayerCalendar : getChildCalendar;

        const result = await fetcher(targetUserId, ds, ds, true);
        const fetched = result.events || [];
        const locks = result.dayLocks || {};
        cacheRef.current[cacheKey] = { events: fetched, dayLocks: locks };
        setEvents(fetched);
        setDayLocks((prev) => ({ ...prev, ...locks }));
      } catch {
        setBackendError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [targetUserId, callerRole],
  );

  // ─── Load on mount / focus / date change ─────────────────────────

  useEffect(() => {
    if (isFocused) {
      if (!wasFocusedRef.current) {
        cacheRef.current = {};
      }
      loadData(selectedDate);
    }
    wasFocusedRef.current = isFocused;
  }, [isFocused, selectedDate, loadData]);

  // ─── Actions ─────────────────────────────────────────────────────

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateRaw(date);
  }, []);

  const refresh = useCallback(() => {
    cacheRef.current = {};
    loadData(selectedDate);
  }, [selectedDate, loadData]);

  return {
    events,
    selectedDate,
    isLoading,
    backendError,
    dayLocks,
    setSelectedDate,
    refresh,
  };
}
