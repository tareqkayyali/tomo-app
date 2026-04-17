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

  const updateItem = (i: number, patch: Partial<StudyMixItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addSubject = () => {
    const subject = newSubject.trim();
    if (!subject) return;
    if (items.some((it) => it.subject.toLowerCase() === subject.toLowerCase())) {
      setNewSubject('');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        subject,
        sessionsPerWeek: 2,
        durationMin: 45,
        placement: 'flexible',
        fixedDays: [],
      },
    ]);
    setNewSubject('');
  };

  const handleSubmit = () => {
    onSubmit({
      type: 'study_plan_capsule',
      toolName: '__submit_study_plan__',
      toolInput: { studyMix: items },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Study plan</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
        {items.length === 0 && (
          <Text style={styles.emptyText}>
            No subjects yet. Add one below or skip to jump straight to the preview.
          </Text>
        )}
        {items.map((item, i) => (
          <View key={`${item.subject}-${i}`} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.subject}>{item.subject}</Text>
              {item.isExamSubject && (
                <View style={styles.examBadge}>
                  <Text style={styles.examBadgeText}>EXAM</Text>
                </View>
              )}
              <Pressable onPress={() => removeItem(i)} hitSlop={8}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>

            <PillSelector
              label="Per week"
              options={SESSION_PILLS}
              selected={String(item.sessionsPerWeek)}
              onSelect={(id) => updateItem(i, { sessionsPerWeek: parseInt(id, 10) })}
            />
            <PillSelector
              label="Duration"
              options={DURATION_PILLS}
              selected={String(item.durationMin)}
              onSelect={(id) => updateItem(i, { durationMin: parseInt(id, 10) })}
            />
          </View>
        ))}
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
