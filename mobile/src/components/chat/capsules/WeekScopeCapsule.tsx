/**
 * WeekScopeCapsule — Step 1 of the week planner.
 *
 * Combines two selections the athlete makes at the start of the flow:
 *   - Which week to plan (This / Next / Week after)
 *   - What athlete mode to plan under (Balanced / League / Study / Rest —
 *     sourced from athlete_modes CMS table)
 *
 * Mode choice scopes the builder for THIS plan — affects maxHardPerWeek
 * and other caps. It doesn't re-mode the athlete globally (that stays a
 * deliberate MODE_CHANGE event the athlete triggers separately).
 *
 * Submits `{ weekChoice: 'this'|'next'|'after', modeId: string }`.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type {
  WeekScopeCapsule as WeekScopeCapsuleType,
  CapsuleAction,
} from '../../../types/chat';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: WeekScopeCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function WeekScopeCapsuleComponent({ card, onSubmit }: Props) {
  const weeks = Array.isArray(card.weeks) ? card.weeks : [];
  const modes = Array.isArray(card.modes) ? card.modes : [];
  const [weekChoice, setWeekChoice] = useState<string>(weeks[0]?.id ?? 'this');
  const [modeId, setModeId] = useState<string>(card.currentMode ?? modes[0]?.id ?? 'balanced');

  const handleSubmit = () => {
    onSubmit({
      type: 'week_scope_capsule',
      toolName: '__submit_week_scope__',
      toolInput: { weekChoice, modeId },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>WHICH WEEK</Text>
      <View style={styles.group}>
        {weeks.map((w) => {
          const selected = w.id === weekChoice;
          return (
            <Pressable
              key={w.id}
              onPress={() => setWeekChoice(w.id)}
              style={({ pressed }) => [
                styles.choiceRow,
                selected && styles.choiceRowSelected,
                pressed && styles.choiceRowPressed,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <View style={styles.choiceBody}>
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                  {w.label}
                </Text>
                {w.description ? <Text style={styles.choiceDesc}>{w.description}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>MODE FOR THIS WEEK</Text>
      <View style={styles.group}>
        {modes.map((m) => {
          const selected = m.id === modeId;
          return (
            <Pressable
              key={m.id}
              onPress={() => setModeId(m.id)}
              style={({ pressed }) => [
                styles.choiceRow,
                selected && styles.choiceRowSelected,
                pressed && styles.choiceRowPressed,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <View style={styles.choiceBody}>
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                  {m.label}
                </Text>
                {m.description ? <Text style={styles.choiceDesc}>{m.description}</Text> : null}
              </View>
              {card.currentMode === m.id && !selected ? (
                <Text style={styles.currentTag}>current</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <CapsuleSubmitButton title="Next: training mix" onPress={handleSubmit} />
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
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textInactive,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  group: {
    gap: spacing.xs,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  choiceRowSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.chipBackground,
  },
  choiceRowPressed: {
    opacity: 0.7,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent1,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent1,
  },
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  choiceLabelSelected: {
    color: colors.accent1,
  },
  choiceDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  currentTag: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
