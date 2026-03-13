/**
 * useCalendarData Hook
 * Manages calendar state: selected date, view mode, events, plan, checkins.
 * Handles data fetching, caching, and navigation between dates.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  getToday,
  getCheckins,
  getCalendarEventsByRange,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../services/api';
import {
  toDateStr,
  isSameDay,
  addDays,
  getWeekStart,
} from '../utils/calendarHelpers';
import type { Plan, Checkin, CalendarEvent, CalendarEventPatch } from '../types';

export type ViewMode = 'focus' | 'day' | 'week' | 'month';

interface CalendarState {
  selectedDate: Date;
  viewMode: ViewMode;
  events: CalendarEvent[];
  plan: Plan | null;
  checkins: Checkin[];
  isLoading: boolean;
  backendError: boolean;
}

interface CalendarActions {
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
  refresh: () => void;
  handleDeleteEvent: (eventId: string) => Promise<boolean>;
  handleUpdateEvent: (eventId: string, patch: CalendarEventPatch) => Promise<boolean>;
}

export type CalendarData = CalendarState & CalendarActions;

export function useCalendarData(): CalendarData {
  const [selectedDate, setSelectedDateRaw] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('focus');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);

  const isFocused = useIsFocused();
  const cacheRef = useRef<Record<string, CalendarEvent[]>>({});
  const wasFocusedRef = useRef(true);

  // ─── Compute date range for current view ──────────────────────────

  const getVisibleRange = useCallback(
    (date: Date, mode: ViewMode): { start: string; end: string } => {
      if (mode === 'focus' || mode === 'day') {
        const ds = toDateStr(date);
        return { start: ds, end: ds };
      }
      if (mode === 'week') {
        const mon = getWeekStart(date);
        return { start: toDateStr(mon), end: toDateStr(addDays(mon, 6)) };
      }
      // month — fetch full month + padding days
      const first = new Date(date.getFullYear(), date.getMonth(), 1);
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      // Extend by 6 days on each side for grid padding
      return {
        start: toDateStr(addDays(first, -6)),
        end: toDateStr(addDays(last, 6)),
      };
    },
    [],
  );

  // ─── Fetch data ───────────────────────────────────────────────────

  const loadData = useCallback(
    async (date: Date, mode: ViewMode) => {
      setIsLoading(true);
      setBackendError(false);

      try {
        const { start, end } = getVisibleRange(date, mode);
        const cacheKey = `${start}_${end}`;

        // Parallel fetches
        const promises: Promise<unknown>[] = [];

        // Events (check cache)
        let eventsPromise: Promise<{ events: CalendarEvent[] }>;
        if (cacheRef.current[cacheKey]) {
          eventsPromise = Promise.resolve({ events: cacheRef.current[cacheKey] });
        } else {
          eventsPromise = getCalendarEventsByRange(start, end);
        }
        promises.push(eventsPromise);

        // Plan (only if today is in view)
        const isViewingToday = isSameDay(date, new Date());
        const planPromise = isViewingToday ? getToday() : Promise.resolve(null);
        promises.push(planPromise);

        // Checkins (always fetch 14 for weekly dots)
        const checkinsPromise = getCheckins(14);
        promises.push(checkinsPromise);

        const [eventsResult, planResult, checkinsResult] = await Promise.all(promises);

        const fetchedEvents = (eventsResult as { events: CalendarEvent[] }).events || [];
        cacheRef.current[cacheKey] = fetchedEvents;
        setEvents(fetchedEvents);

        if (planResult && typeof planResult === 'object' && 'plan' in planResult) {
          setPlan((planResult as { plan: Plan | null }).plan);
        } else if (!isViewingToday) {
          setPlan(null);
        }

        const fetchedCheckins =
          (checkinsResult as { checkins: Checkin[] }).checkins || [];
        setCheckins(fetchedCheckins);
      } catch {
        setBackendError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [getVisibleRange],
  );

  // ─── Load on mount / focus / date change ──────────────────────────

  useEffect(() => {
    if (isFocused) {
      // Clear cache when regaining focus (returning from AddEvent, etc.)
      if (!wasFocusedRef.current) {
        cacheRef.current = {};
      }
      loadData(selectedDate, viewMode);
    }
    wasFocusedRef.current = isFocused;
  }, [isFocused, selectedDate, viewMode, loadData]);

  // ─── Navigation actions ───────────────────────────────────────────

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateRaw(date);
  }, []);

  const goNext = useCallback(() => {
    setSelectedDateRaw((prev) => {
      if (viewMode === 'focus' || viewMode === 'day') return addDays(prev, 1);
      if (viewMode === 'week') return addDays(prev, 7);
      // month
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  }, [viewMode]);

  const goPrev = useCallback(() => {
    setSelectedDateRaw((prev) => {
      if (viewMode === 'focus' || viewMode === 'day') return addDays(prev, -1);
      if (viewMode === 'week') return addDays(prev, -7);
      // month
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  }, [viewMode]);

  const goToday = useCallback(() => {
    setSelectedDateRaw(new Date());
  }, []);

  const refresh = useCallback(() => {
    cacheRef.current = {};
    loadData(selectedDate, viewMode);
  }, [selectedDate, viewMode, loadData]);

  const handleDeleteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      try {
        await deleteCalendarEvent(eventId);
        // Optimistically remove from state
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        // Clear cache so next fetch is fresh
        cacheRef.current = {};
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const handleUpdateEvent = useCallback(
    async (eventId: string, patch: CalendarEventPatch): Promise<boolean> => {
      try {
        const { event: updated } = await updateCalendarEvent(eventId, patch);
        // Optimistically update in state
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? updated : e)),
        );
        // Clear cache so next fetch is fresh
        cacheRef.current = {};
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return {
    selectedDate,
    viewMode,
    events,
    plan,
    checkins,
    isLoading,
    backendError,
    setSelectedDate,
    setViewMode,
    goNext,
    goPrev,
    goToday,
    refresh,
    handleDeleteEvent,
    handleUpdateEvent,
  };
}
