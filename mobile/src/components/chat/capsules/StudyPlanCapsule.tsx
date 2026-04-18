/**
 * StudyPlanCapsule — Step 3 of the week planner.
 *
 * Study is the simpler sibling of TrainingMixCapsule:
 *   - One global duration that applies to every scheduled subject.
 *   - Per-subject frequency (0 = not this week, 1–5 = include at that count).
 *   - Add a subject inline; it joins the player's permanent library.
 *
 * No EXAM differentiation, no per-row Remove (the library is permanent;
 * you just don't schedule a subject by leaving it at 0).
 *
 * Submits `{ studyMix: StudyMixItem[] }` with only subjects the athlete
 * opted in to this week. The global duration is applied to each item
 * on submit.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type {
  StudyPlanCapsule as StudyPlanCapsuleType,
  StudyMixItem,
  CapsuleAction,
} from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { updateStudySubjects } from '../../../services/api';

interface Props {
  card: StudyPlanCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const SESSION_PILLS = [
  { id: '0', label: '0' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '5', label: '5' },
];

const DURATION_PILLS = [
  { id: '30', label: '30m' },
  { id: '45', label: '45m' },
  { id: '60', label: '1h' },
  { id: '75', label: '1h15' },
  { id: '90', label: '1h30' },
  { id: '120', label: '2h' },
];

export function StudyPlanCapsuleComponent({ card, onSubmit }: Props) {
  const initial = useMemo<StudyMixItem[]>(
    () => (Array.isArray(card.subjects) ? card.subjects : []),
    [card.subjects],
  );
  const [items, setItems] = useState<StudyMixItem[]>(initial);
  const [newSubject, setNewSubject] = useState('');
  const [persistError, setPersistError] = useState<string | null>(null);

  // Global duration default — takes the most common duration from the
  // suggestions so the athlete starts from a sensible value, then lets
  // them override once for all subjects.
  const [durationMin, setDurationMin] = useState<number>(() => {
    const counts = new Map<number, number>();
    for (const it of initial) {
      const d = Number(it.durationMin) || 45;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    let best = 45;
    let bestCount = 0;
    for (const [d, c] of counts) {
      if (c > bestCount) {
        best = d;
        bestCount = c;
      }
    }
    return best;
  });

  const updateItem = (i: number, patch: Partial<StudyMixItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  /**
   * Persist the full subject list to player_schedule_preferences.study_subjects
   * so subjects added inside this flow survive to the next session.
   * Hits /api/v1/week-plan/subjects (supabaseAdmin-backed — no SUPABASE_DB_URL
   * dependency unlike the legacy /api/v1/schedule/rules path).
   */
  const persistStudySubjects = (nextItems: StudyMixItem[]) => {
    const unique = Array.from(
      new Set(
        nextItems
          .map((it) => it.subject.trim())
          .filter((s) => s.length > 0),
      ),
    );
    setPersistError(null);
    updateStudySubjects(unique).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Could not save subject';
      setPersistError(msg);
    });
  };

  const addSubject = () => {
    const subject = newSubject.trim();
    if (!subject) return;
    if (items.some((it) => it.subject.toLowerCase() === subject.toLowerCase())) {
      setNewSubject('');
      return;
    }
    const nextItems: StudyMixItem[] = [
      ...items,
      {
        subject,
        // Default to not scheduled — athlete opts in by tapping a number.
        sessionsPerWeek: 0,
        durationMin,
        placement: 'flexible',
        fixedDays: [],
      },
    ];
    setItems(nextItems);
    setNewSubject('');
    persistStudySubjects(nextItems);
  };

  const handleSubmit = () => {
    // Apply the global duration to every scheduled subject. Subjects left
    // at 0 stay in the library but aren't scheduled this week.
    const scheduled = items
      .filter((it) => it.sessionsPerWeek > 0)
      .map((it) => ({ ...it, durationMin }));
    onSubmit({
      type: 'study_plan_capsule',
      toolName: '__submit_study_plan__',
      toolInput: { studyMix: scheduled },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Study plan</Text>

      {persistError && (
        <Text style={styles.persistError}>
          Couldn&apos;t save subject library: {persistError}
        </Text>
      )}

      <PillSelector
        label="Session duration (applies to all subjects)"
        options={DURATION_PILLS}
        selected={String(durationMin)}
        onSelect={(id) => setDurationMin(parseInt(id, 10))}
      />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
        {items.length === 0 && (
          <Text style={styles.emptyText}>
            No subjects yet. Add one below to get started.
          </Text>
        )}
        {items.map((item, i) => {
          const included = item.sessionsPerWeek > 0;
          return (
            <View
              key={`${item.subject}-${i}`}
              style={[styles.row, !included && styles.rowExcluded]}
            >
              <Text style={[styles.subject, !included && styles.subjectExcluded]}>
                {item.subject}
              </Text>
              <PillSelector
                label={included ? 'Sessions this week' : 'Not scheduled — tap a number to include'}
                options={SESSION_PILLS}
                selected={String(item.sessionsPerWeek)}
                onSelect={(id) => updateItem(i, { sessionsPerWeek: parseInt(id, 10) })}
              />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.addRow}>
        <TextInput
          value={newSubject}
          onChangeText={setNewSubject}
          placeholder="Add subject (e.g. Chemistry)"
          placeholderTextColor={colors.textInactive}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={addSubject}
        />
        <Pressable onPress={addSubject} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <CapsuleSubmitButton title="Preview week" onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: spacing.sm,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
  },
  row: {
    gap: 6,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowExcluded: {
    opacity: 0.55,
  },
  subject: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  subjectExcluded: {
    color: colors.textSecondary,
  },
  persistError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.warning,
    paddingHorizontal: spacing.xs,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent1,
  },
  addButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent1,
  },
});
