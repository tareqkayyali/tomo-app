/**
 * Saved Study Plans Service
 * Persists booked study plans locally via AsyncStorage for later viewing + PDF export.
 * Follows the savedChats.ts pattern.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_SAVED_STUDY_PLANS } from '../constants/storageKeys';
import type { SavedStudyPlan, StudyBlock, StudyPlanConfig } from '../types';

const MAX_PLANS = 10;

// ─── Read all saved plans ────────────────────────────────────────────

export async function getSavedStudyPlans(): Promise<SavedStudyPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SAVED_STUDY_PLANS);
    if (!raw) return [];
    const plans: SavedStudyPlan[] = JSON.parse(raw);
    return plans.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    return [];
  }
}

// ─── Save a plan (upsert, cap at MAX_PLANS) ─────────────────────────

export async function saveStudyPlan(plan: SavedStudyPlan): Promise<void> {
  try {
    const plans = await getSavedStudyPlans();
    const index = plans.findIndex((p) => p.id === plan.id);
    if (index >= 0) {
      plans[index] = plan;
    } else {
      plans.unshift(plan);
    }
    // Prune oldest if over cap
    const trimmed = plans.slice(0, MAX_PLANS);
    await AsyncStorage.setItem(STORAGE_KEY_SAVED_STUDY_PLANS, JSON.stringify(trimmed));
  } catch {
    // Silently fail — non-critical
  }
}

// ─── Delete a plan ───────────────────────────────────────────────────

export async function deleteStudyPlan(planId: string): Promise<void> {
  try {
    const plans = await getSavedStudyPlans();
    const filtered = plans.filter((p) => p.id !== planId);
    await AsyncStorage.setItem(STORAGE_KEY_SAVED_STUDY_PLANS, JSON.stringify(filtered));
  } catch {
    // Silently fail
  }
}

// ─── Factory: create a SavedStudyPlan from booking data ──────────────

function formatDateRange(start: string, end: string): string {
  const fmt = (ds: string) => {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function createStudyPlanFromBooking(
  blocks: StudyBlock[],
  exams: { subject: string; examDate: string; examType: string }[],
  config: StudyPlanConfig,
): SavedStudyPlan {
  const dates = blocks.map((b) => b.date).sort();
  const examDates = exams.map((e) => e.examDate).sort();
  const allDates = [...dates, ...examDates].sort();

  const start = allDates[0] || dates[0] || '';
  const end = allDates[allDates.length - 1] || dates[dates.length - 1] || '';

  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: start && end ? formatDateRange(start, end) : 'Study Plan',
    createdAt: new Date().toISOString(),
    blocks,
    exams,
    config,
    dateRange: { start, end },
    examCount: exams.length,
    blockCount: blocks.length,
  };
}
