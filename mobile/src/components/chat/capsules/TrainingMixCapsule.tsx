/**
 * TrainingMixCapsule — Step 2 of the week planner.
 *
 * One row per training category (Club, Gym, Personal, Recovery, etc.).
 * Athlete taps to set sessions/week, duration, and fixed-days vs
 * flexible placement. On submit the whole mix is posted back as
 * `{ trainingMix: TrainingMixItem[] }` to the multi-step flow, which
 * advances to the study plan picker.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type {
  TrainingMixCapsule as TrainingMixCapsuleType,
  TrainingMixItem,
  CapsuleAction,
  WeekPlanPlacement,
} from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: TrainingMixCapsuleType;
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

const DAY_PILLS = [
  { id: '1', label: 'Mon' },
  { id: '2', label: 'Tue' },
  { id: '3', label: 'Wed' },
  { id: '4', label: 'Thu' },
  { id: '5', label: 'Fri' },
  { id: '6', label: 'Sat' },
  { id: '0', label: 'Sun' },
];

const CATEGORY_LABELS: Record<string, string> = {
  club: 'Club / Academy',
  gym: 'Gym',
  personal: 'Personal',
  recovery: 'Recovery',
  individual_technical: 'Technical',
  tactical: 'Tactical',
  match_competition: 'Match',
  mental_performance: 'Mental',
};

export function TrainingMixCapsuleComponent({ card, onSubmit }: Props) {
  const initial = useMemo<TrainingMixItem[]>(() => {
    if (Array.isArray(card.categories) && card.categories.length > 0) return card.categories;
    return [];
  }, [card.categories]);

  const [items, setItems] = useState<TrainingMixItem[]>(initial);

  const updateItem = (i: number, patch: Partial<TrainingMixItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const handleSubmit = () => {
    onSubmit({
      type: 'training_mix_capsule',
      toolName: '__submit_training_mix__',
      toolInput: { trainingMix: items },
      agentType: 'timeline',
    });
  };

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Training mix</Text>
        <Text style={styles.subtext}>
          Your training categories aren&apos;t set up yet. Configure them in settings first.
        </Text>
        <CapsuleSubmitButton
          title="Skip training, study only"
          onPress={() => onSubmit({
            type: 'training_mix_capsule',
            toolName: '__submit_training_mix__',
            toolInput: { trainingMix: [] },
            agentType: 'timeline',
          })}
          variant="subtle"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Training mix</Text>
      {Array.isArray(card.notes) && card.notes.length > 0 && (
        <View style={styles.notesBlock}>
          {card.notes.map((n, i) => (
            <Text
              key={i}
              style={[styles.noteText, n.level === 'warn' && styles.noteWarn]}
            >
              {n.text}
            </Text>
          ))}
        </View>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
      >
        {items.map((item, i) => {
          const label = item.label ?? CATEGORY_LABELS[item.category] ?? item.category;
          const fixedSet = new Set((item.fixedDays ?? []).map(String));
          return (
            <View key={`${item.category}-${i}`} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>

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

              {item.sessionsPerWeek > 0 && (
                <>
                  <View style={styles.placementRow}>
                    <Pressable
                      onPress={() => updateItem(i, { placement: 'flexible', fixedDays: [] })}
                      style={[styles.toggle, item.placement === 'flexible' && styles.toggleActive]}
                    >
                      <Text style={[styles.toggleText, item.placement === 'flexible' && styles.toggleTextActive]}>
                        Flexible
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updateItem(i, { placement: 'fixed' })}
                      style={[styles.toggle, item.placement === 'fixed' && styles.toggleActive]}
                    >
                      <Text style={[styles.toggleText, item.placement === 'fixed' && styles.toggleTextActive]}>
                        Fixed days
                      </Text>
                    </Pressable>
                  </View>

                  {item.placement === 'fixed' && (
                    <View style={styles.daysRow}>
                      {DAY_PILLS.map((d) => {
                        const selected = fixedSet.has(d.id);
                        return (
                          <Pressable
                            key={d.id}
                            onPress={() => {
                              const next = new Set(fixedSet);
                              if (selected) next.delete(d.id);
                              else next.add(d.id);
                              updateItem(i, {
                                fixedDays: Array.from(next).map((s) => parseInt(s, 10)),
                              });
                            }}
                            style={[styles.dayPill, selected && styles.dayPillActive]}
                          >
                            <Text style={[styles.dayText, selected && styles.dayTextActive]}>
                              {d.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      <CapsuleSubmitButton title="Next: study plan" onPress={handleSubmit} />
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
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  notesBlock: {
    gap: 4,
  },
  noteText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  noteWarn: {
    color: colors.warning,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: spacing.sm,
  },
  row: {
    gap: 6,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  placementRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  toggle: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  toggleActive: {
    borderColor: colors.accent1,
    backgroundColor: colors.chipBackground,
  },
  toggleText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.accent1,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dayPillActive: {
    borderColor: colors.accent1,
    backgroundColor: colors.accentSubtle,
  },
  dayText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  dayTextActive: {
    color: colors.textPrimary,
  },
});
