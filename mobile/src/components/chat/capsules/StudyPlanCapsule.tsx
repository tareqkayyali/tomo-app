/**
 * StudyPlanCapsule — Step 3 of the week planner.
 *
 * One row per study subject. Athlete sets sessions/week + duration.
 * Can add a new subject inline. Exam subjects are badged; their
 * defaults bump slightly when exam period is active (that boost is
 * applied server-side in /suggest before the card is rendered).
 *
 * Submits back as `{ studyMix: StudyMixItem[] }`.
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
import { updateScheduleRules } from '../../../services/api';

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

  const updateItem = (i: number, patch: Partial<StudyMixItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  /**
   * Persist the full subject list to player_schedule_preferences.study_subjects
   * so subjects added inside this flow survive to the next session. The PATCH
   * accepts the authoritative text[] — we send ALL known subjects (existing +
   * the one just added), deduped, matching what the schedule-rules endpoint
   * expects (backend/app/api/v1/schedule/rules/route.ts:41). Fire-and-forget
   * at the UX level; a visible banner surfaces failures so the athlete knows
   * the subject won't persist if it can't reach the server.
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
    updateScheduleRules({ study_subjects: unique }).catch((err) => {
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
        sessionsPerWeek: 2,
        durationMin: 45,
        placement: 'flexible',
        fixedDays: [],
      },
    ];
    setItems(nextItems);
    setNewSubject('');
    persistStudySubjects(nextItems);
  };

  const handleSubmit = () => {
    // Only schedule subjects the athlete has actually opted in to
    // (sessionsPerWeek > 0). Keep the row on screen when 0 — that's
    // the "included in library, just not this week" state.
    const scheduled = items.filter((it) => it.sessionsPerWeek > 0);
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
          Couldn&apos;t save that subject for next time: {persistError}
        </Text>
      )}

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
              <View style={styles.rowHeader}>
                <Text style={[styles.subject, !included && styles.subjectExcluded]}>
                  {item.subject}
                </Text>
                {item.isExamSubject && (
                  <View style={styles.examBadge}>
                    <Text style={styles.examBadgeText}>EXAM</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => {
                    const nextItems = items.filter((_, idx) => idx !== i);
                    removeItem(i);
                    persistStudySubjects(nextItems);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>

              <PillSelector
                label={included ? 'Sessions this week' : 'Not scheduled — tap a number to include'}
                options={SESSION_PILLS}
                selected={String(item.sessionsPerWeek)}
                onSelect={(id) => updateItem(i, { sessionsPerWeek: parseInt(id, 10) })}
              />
              {included && (
                <PillSelector
                  label="Duration"
                  options={DURATION_PILLS}
                  selected={String(item.durationMin)}
                  onSelect={(id) => updateItem(i, { durationMin: parseInt(id, 10) })}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.addRow}>
        <TextInput
          value={newSubject}
          onChangeText={setNewSubject}
          placeholder="Add subject"
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
    maxHeight: 400,
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
  subjectExcluded: {
    color: colors.textSecondary,
  },
  persistError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.warning,
    paddingHorizontal: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subject: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  examBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.warning,
  },
  examBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.background,
  },
  removeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
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
