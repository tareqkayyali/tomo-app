/**
 * Calendar Helpers — Pure date math & formatting functions
 * No React dependencies, fully testable.
 */

import { colors } from '../theme';
import type { Plan, CalendarEvent, FocusItem, IntensityLevel } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeekDay {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // Mon, Tue, ...
}

export interface MonthDay {
  date: Date;
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export interface IntensityConfig {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  ringPercent: number;
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

/** Get Monday through Sunday for the week containing `date`. */
export function getWeekDays(date: Date): WeekDay[] {
  const monday = getWeekStart(date);
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    days.push({
      date: d,
      dateStr: toDateStr(d),
      dayLabel: labels[i],
    });
  }
  return days;
}

/** Get a 6-row x 7-col grid of days for a calendar month view. */
export function getMonthDays(year: number, month: number): MonthDay[] {
  const today = new Date();
  const todayStr = toDateStr(today);

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  const startDow = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -startDow);

  const days: MonthDay[] = [];
  // Always generate 42 cells (6 rows x 7 cols)
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const ds = toDateStr(d);
    days.push({
      date: d,
      dateStr: ds,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: ds === todayStr,
    });
  }
  return days;
}

/** Format date as "Monday, February 22" */
export function formatDateHeader(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Format as "February 2026" */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Format as "Feb 22 – Feb 28" for week range */
export function formatWeekRange(date: Date): string {
  const start = getWeekStart(date);
  const end = addDays(start, 6);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr} – ${endStr}`;
}

/** Check if two dates are the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Return a new Date `n` days from `date` */
export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/** Get Monday of the week containing `date` */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (dayOfWeek + 6) % 7; // Monday offset
  d.setDate(d.getDate() - diff);
  return d;
}

/** Convert Date to "YYYY-MM-DD" */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Readiness & Intensity ──────────────────────────────────────────────────

/** Map readiness level string to a color. */
export function getReadinessColor(readiness: string | null | undefined): string | null {
  if (!readiness) return null;
  const upper = readiness.toUpperCase();
  if (upper === 'GREEN') return colors.readinessGreen;
  if (upper === 'YELLOW') return colors.readinessYellow;
  if (upper === 'RED') return colors.readinessRed;
  return null;
}

/** Map intensity string to config object with label, icon, color, etc. */
export function getIntensityConfig(intensity: string): IntensityConfig {
  const key = (intensity ?? 'MODERATE').toUpperCase();
  switch (key) {
    case 'REST':
      return { label: 'Rest', icon: 'bed-outline', color: colors.intensityRest, bgColor: colors.intensityRestBg, ringPercent: 0.25 };
    case 'LIGHT':
      return { label: 'Light', icon: 'walk-outline', color: colors.intensityLight, bgColor: colors.intensityLightBg, ringPercent: 0.50 };
    case 'MODERATE':
      return { label: 'Moderate', icon: 'bicycle-outline', color: colors.intensityModerate, bgColor: colors.intensityModerateBg, ringPercent: 0.75 };
    case 'HARD':
      return { label: 'Hard', icon: 'barbell-outline', color: colors.intensityHard, bgColor: colors.intensityHardBg, ringPercent: 1.0 };
    default:
      return { label: 'Moderate', icon: 'bicycle-outline', color: colors.intensityModerate, bgColor: colors.intensityModerateBg, ringPercent: 0.75 };
  }
}

// ─── Event Type Colors ──────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  training: colors.eventTraining,
  match: colors.eventMatch,
  recovery: colors.eventRecovery,
  study_block: colors.eventStudyBlock,
  exam: colors.eventExam,
  other: colors.eventOther,
};

/** Get color for a calendar event type */
export function getEventTypeColor(type: string | undefined): string {
  return EVENT_TYPE_COLORS[type ?? 'other'] ?? colors.eventOther;
}

// ─── Sport Dot Colors ───────────────────────────────────────────────────────

const SPORT_DOT_COLORS: Record<string, string> = {
  football: '#FF6B35',
  padel: '#00D9FF',
  general: '#AAAAAA',
};

/** Get dot color for a sport */
export function getSportDotColor(sport: string | undefined): string {
  return SPORT_DOT_COLORS[sport ?? 'general'] ?? '#AAAAAA';
}

/** Get sport icon name */
export function getSportIcon(sport: string | undefined): string {
  if (sport === 'football') return 'football-outline';
  if (sport === 'padel') return 'tennisball-outline';
  return 'ellipsis-horizontal';
}

/** Get sport label */
export function getSportLabel(sport: string | undefined): string {
  if (sport === 'football') return 'Football';
  if (sport === 'padel') return 'Padel';
  return 'General';
}

// ─── Cross-Sport Load Warning ───────────────────────────────────────────────

/**
 * Check for high-intensity events in multiple sports within 48 hours
 * of the selected date. Returns a warning message if found.
 *
 * Safety: Rest days are universal — the body doesn't rest sport-by-sport.
 * Research: 48h minimum recovery after matches (PMC, 2025).
 */
export function getCrossSportLoadWarning(
  events: CalendarEvent[],
  selectedDate: Date,
): string | null {
  const selectedMs = selectedDate.getTime();
  const window48h = 48 * 60 * 60 * 1000;

  // Find high-intensity events within 48h window (before and after)
  const nearbyHard = events.filter((evt) => {
    if (evt.intensity !== 'HARD') return false;
    const evtMs = new Date(evt.date + 'T12:00:00').getTime();
    return Math.abs(evtMs - selectedMs) <= window48h;
  });

  // Check if multiple sports have hard events
  const sportSet = new Set(
    nearbyHard
      .map((e) => e.sport ?? 'general')
      .filter((s) => s !== 'general'),
  );

  if (sportSet.size >= 2) {
    return 'You have intense sessions in both sports within 48 hours. Research shows 48h minimum recovery is needed after matches (PMC, 2025).';
  }

  return null;
}

// ─── Focus View Helpers ─────────────────────────────────────────────────────

/**
 * Build a prioritized list of FocusItems from plan + events.
 * Plan comes first (if it exists), then events sorted by time.
 * Returns at most 3 items.
 */
export function computeFocusItems(plan: Plan | null, events: CalendarEvent[]): FocusItem[] {
  const items: FocusItem[] = [];

  // Plan is always first priority
  if (plan) {
    const intensity = plan.recommendedIntensity;
    const config = getIntensityConfig(intensity);
    const durationStr = plan.duration ? `${plan.duration} min` : '';
    items.push({
      id: 'plan',
      title: `${config.label} ${intensity === 'REST' ? 'Day' : 'Training'}`,
      subtitle: plan.recommendation
        ? plan.recommendation.substring(0, 60) + (plan.recommendation.length > 60 ? '...' : '')
        : durationStr,
      time: durationStr || null,
      type: 'plan',
      intensity: intensity as IntensityLevel,
      source: 'plan',
    });
  }

  // Sort events by time (timed first, then untimed)
  const sorted = [...events].sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });

  for (const event of sorted) {
    if (items.length >= 3) break;
    const timeStr = event.startTime
      ? formatTime12h(event.startTime) + (event.endTime ? ` – ${formatTime12h(event.endTime)}` : '')
      : null;
    items.push({
      id: event.id,
      title: event.name,
      subtitle: event.type.replace('_', ' '),
      time: timeStr,
      type: event.type,
      intensity: event.intensity,
      source: 'event',
    });
  }

  return items;
}

/** Convert "HH:MM" (24h) to "H:MM AM/PM" */
function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return m > 0 ? `${hour12}:${String(m).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

// ─── Time → Pixel Math ─────────────────────────────────────────────────────

/** Convert "HH:MM" string to total minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to Y position in the timeline. */
export function minutesToY(
  minutes: number,
  hourHeight: number,
  startHour: number = 6,
): number {
  const startMinutes = startHour * 60;
  return ((minutes - startMinutes) / 60) * hourHeight;
}
