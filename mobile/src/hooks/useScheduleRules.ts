/**
 * useScheduleRules — Central hook for schedule preferences + rule engine data.
 *
 * Single source of truth consumed by:
 *   - MyRulesScreen (edit all preferences, explicit save)
 *   - StudyPlanView (read study config)
 *   - TrainingPlanView (read training config)
 *   - Generators (read effective rules for placement constraints)
 *
 * Two mutation methods:
 *   - setLocal(patch) — optimistic local-only update (no API call)
 *   - save() — persists current local state to API
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getScheduleRules, updateScheduleRules } from '../services/api';
import type { ScheduleRulesResponse } from '../services/api';
import { getApiUrl } from '../services/apiConfig';
import { colors } from '../theme/colors';

// ── Types (mirrors backend scheduleRuleEngine) ──────────────────

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface LinkedProgram {
  programId: string;
  name: string;
  category?: string;
}

export interface TrainingCategoryRule {
  id: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  mode: 'fixed_days' | 'days_per_week';
  fixedDays: number[];
  daysPerWeek: number;
  sessionDuration: number;
  preferredTime: 'morning' | 'afternoon' | 'evening';
  fixedStartTime?: string; // "HH:MM" when time is known
  fixedEndTime?: string;   // "HH:MM" when time is known
  linkedPrograms?: LinkedProgram[];
}

export interface ExamScheduleEntry {
  id: string;
  subject: string;
  examType: string;
  examDate: string; // YYYY-MM-DD
}

export interface PlayerSchedulePreferences {
  // School
  school_days: DayOfWeek[];
  school_start: string;
  school_end: string;

  // Sleep
  sleep_start: string;
  sleep_end: string;

  // Day bounds
  day_bounds_start: string;
  day_bounds_end: string;

  // Study
  study_days: DayOfWeek[];
  study_start: string;
  study_duration_min: number;

  // Gym
  gym_days: DayOfWeek[];
  gym_start: string;
  gym_duration_min: number;

  // Club
  club_days: DayOfWeek[];
  club_start: string;

  // Personal dev
  personal_dev_days: DayOfWeek[];
  personal_dev_start: string;

  // Buffers
  buffer_default_min: number;
  buffer_post_match_min: number;
  buffer_post_high_intensity_min: number;

  // Athlete Mode (Planning Intelligence)
  athlete_mode: string;

  // Scenario flags (legacy — derived from athlete_mode)
  league_is_active: boolean;
  exam_period_active: boolean;

  // Exam details
  exam_subjects: string[];
  exam_start_date: string | null;
  pre_exam_study_weeks: number;
  days_per_subject: number;

  // Flexible schema
  training_categories: TrainingCategoryRule[];
  exam_schedule: ExamScheduleEntry[];
  study_subjects: string[];
}

export interface EffectiveRules {
  buffers: {
    default: number;
    afterHighIntensity: number;
    afterMatch: number;
    beforeMatch: number;
  };
  intensityCaps: {
    maxHardPerWeek: number;
    maxSessionsPerDay: number;
    noHardBeforeMatch: boolean;
    noHardOnExamDay: boolean;
    recoveryDayAfterMatch: boolean;
  };
  dayBounds: { startHour: number; endHour: number };
  ruleCount: number;
}

export interface ScheduleRulesData {
  preferences: PlayerSchedulePreferences;
  scenario: string;
  athleteMode: string;
  effectiveRules: EffectiveRules;
}

// ── Default preferences (fallback before API loads) ─────────────

const DEFAULT_TRAINING_CATEGORIES: TrainingCategoryRule[] = [
  {
    id: 'club',
    label: 'Club / Academy',
    icon: 'football-outline',
    color: colors.accent,
    enabled: true,
    mode: 'fixed_days',
    fixedDays: [1, 3, 5],
    daysPerWeek: 3,
    sessionDuration: 90,
    preferredTime: 'afternoon',
  },
  {
    id: 'gym',
    label: 'Gym',
    icon: 'barbell-outline',
    color: colors.info,
    enabled: true,
    mode: 'days_per_week',
    fixedDays: [],
    daysPerWeek: 2,
    sessionDuration: 60,
    preferredTime: 'morning',
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'fitness-outline',
    color: colors.accent,
    enabled: false,
    mode: 'days_per_week',
    fixedDays: [],
    daysPerWeek: 1,
    sessionDuration: 60,
    preferredTime: 'evening',
  },
];

export const DEFAULT_PREFERENCES: PlayerSchedulePreferences = {
  school_days: [0, 1, 2, 3, 4],
  school_start: '08:00',
  school_end: '15:00',
  sleep_start: '22:00',
  sleep_end: '06:00',
  day_bounds_start: '06:00',
  day_bounds_end: '22:00',
  study_days: [0, 1, 2, 3],
  study_start: '16:00',
  study_duration_min: 45,
  gym_days: [0, 1, 2, 3, 4, 5, 6],
  gym_start: '18:00',
  gym_duration_min: 60,
  club_days: [1, 3, 5],
  club_start: '19:30',
  personal_dev_days: [5, 6],
  personal_dev_start: '17:00',
  buffer_default_min: 30,
  buffer_post_match_min: 60,
  buffer_post_high_intensity_min: 45,
  league_is_active: false,
  exam_period_active: false,
  exam_subjects: [],
  athlete_mode: 'balanced',
  exam_start_date: null,
  pre_exam_study_weeks: 3,
  days_per_subject: 3,
  training_categories: DEFAULT_TRAINING_CATEGORIES,
  exam_schedule: [],
  study_subjects: [],
};

// Fields the backend PATCH endpoint accepts
const SAVEABLE_FIELDS = [
  'school_days', 'school_start', 'school_end',
  'sleep_start', 'sleep_end',
  'day_bounds_start', 'day_bounds_end',
  'study_days', 'study_start', 'study_duration_min',
  'gym_days', 'gym_start', 'gym_duration_min',
  'personal_dev_days', 'personal_dev_start',
  'club_days', 'club_start',
  'buffer_default_min', 'buffer_post_match_min', 'buffer_post_high_intensity_min',
  'league_is_active', 'exam_period_active',
  'exam_subjects', 'exam_start_date',
  'pre_exam_study_weeks', 'days_per_subject',
  'training_categories', 'exam_schedule', 'study_subjects',
  'athlete_mode', 'mode_params_override',
] as const;

// ── CMS Training Category Templates ────────────────────────────

async function fetchCmsTrainingCategories(): Promise<TrainingCategoryRule[] | null> {
  try {
    const base = getApiUrl();
    const res = await fetch(`${base}/api/v1/content/training-categories`);
    if (!res.ok) return null;
    const data = await res.json();
    const templates = data.categories ?? [];
    if (templates.length === 0) return null;

    return templates.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      label: t.label as string,
      icon: (t.icon as string) ?? 'fitness-outline',
      color: (t.color as string) ?? colors.accent,
      enabled: true,
      mode: (t.default_mode as string) ?? 'fixed_days',
      fixedDays: [],
      daysPerWeek: (t.default_days_per_week as number) ?? 3,
      sessionDuration: (t.default_session_duration as number) ?? 60,
      preferredTime: (t.default_preferred_time as string) ?? 'afternoon',
    }));
  } catch {
    return null; // Silently fall back to hardcoded defaults
  }
}

// ── Hook ────────────────────────────────────────────────────────

export function useScheduleRules() {
  const [rules, setRules] = useState<ScheduleRulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ref always tracks the latest preferences (avoids stale closure issues)
  const currentPrefsRef = useRef<PlayerSchedulePreferences>(DEFAULT_PREFERENCES);
  const savedPrefsRef = useRef<PlayerSchedulePreferences>(DEFAULT_PREFERENCES);

  // ── Load ──
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch saved rules and CMS templates in parallel
      const [data, cmsCategories] = await Promise.all([
        getScheduleRules(),
        fetchCmsTrainingCategories(),
      ]);

      // Use CMS templates as fallback defaults (instead of hardcoded), then hardcoded as last resort
      const categoryFallback = cmsCategories ?? DEFAULT_TRAINING_CATEGORIES;

      const prefs: PlayerSchedulePreferences = {
        ...DEFAULT_PREFERENCES,
        ...(data.preferences as Partial<PlayerSchedulePreferences>),
        training_categories:
          (data.preferences as any).training_categories ?? categoryFallback,
        exam_schedule: (data.preferences as any).exam_schedule ?? [],
        study_subjects: (data.preferences as any).study_subjects ?? [],
      };

      currentPrefsRef.current = prefs;
      savedPrefsRef.current = prefs;
      setRules({
        preferences: prefs,
        scenario: data.scenario,
        effectiveRules: data.effectiveRules,
      });
      setDirty(false);
    } catch (err) {
      console.error('[useScheduleRules] load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load rules');
      const defaults = DEFAULT_PREFERENCES;
      currentPrefsRef.current = defaults;
      savedPrefsRef.current = defaults;
      setRules({
        preferences: defaults,
        scenario: 'normal',
        effectiveRules: {
          buffers: { default: 30, afterHighIntensity: 45, afterMatch: 60, beforeMatch: 120 },
          intensityCaps: {
            maxHardPerWeek: 3,
            maxSessionsPerDay: 2,
            noHardBeforeMatch: true,
            noHardOnExamDay: true,
            recoveryDayAfterMatch: true,
          },
          dayBounds: { startHour: 6, endHour: 22 },
          ruleCount: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── setLocal: update state + ref (no API call) ──
  const setLocal = useCallback(
    (patch: Partial<PlayerSchedulePreferences>) => {
      const updated = { ...currentPrefsRef.current, ...patch };
      currentPrefsRef.current = updated;
      setRules((prev) => {
        if (!prev) return prev;
        return { ...prev, preferences: updated };
      });
      setDirty(true);
    },
    [],
  );

  // ── save: persist current ref state to API ──
  const save = useCallback(
    async () => {
      setSaving(true);
      try {
        // Build payload with only saveable fields from the ref
        const prefs = currentPrefsRef.current;
        const payload: Record<string, unknown> = {};
        for (const key of SAVEABLE_FIELDS) {
          payload[key] = (prefs as any)[key];
        }

        const result = await updateScheduleRules(payload);

        // Mark as saved
        savedPrefsRef.current = { ...prefs };
        setRules((prev) => {
          if (!prev) return prev;
          return { ...prev, scenario: result.scenario };
        });
        setDirty(false);
        return true;
      } catch (err) {
        console.error('[useScheduleRules] save failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to save');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // ── Legacy update method (plan views — set + save immediately) ──
  const update = useCallback(
    async (patch: Partial<PlayerSchedulePreferences>) => {
      // Update ref + state
      const updated = { ...currentPrefsRef.current, ...patch };
      currentPrefsRef.current = updated;
      setRules((prev) => {
        if (!prev) return prev;
        return { ...prev, preferences: updated };
      });

      // Build payload with only the patched fields
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (SAVEABLE_FIELDS.includes(key as any)) {
          payload[key] = value;
        }
      }

      try {
        const result = await updateScheduleRules(payload);
        savedPrefsRef.current = updated;
        setRules((prev) => {
          if (!prev) return prev;
          return { ...prev, scenario: result.scenario };
        });
      } catch (err) {
        console.error('[useScheduleRules] update failed:', err);
        load();
      }
    },
    [load],
  );

  // ── discard: revert to last saved state ──
  const discard = useCallback(() => {
    const saved = savedPrefsRef.current;
    currentPrefsRef.current = saved;
    setRules((prev) => {
      if (!prev) return prev;
      return { ...prev, preferences: saved };
    });
    setDirty(false);
  }, []);

  // ── Init ──
  useEffect(() => {
    load();
  }, [load]);

  return {
    rules,
    loading,
    error,
    dirty,
    saving,
    setLocal,
    save,
    update,
    discard,
    refresh: load,
  };
}
