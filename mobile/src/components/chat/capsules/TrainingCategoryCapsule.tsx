/**
 * TrainingCategoryCapsule — Add/edit training categories inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { TrainingCategoryCapsule as TrainingCategoryCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleStepper } from './shared/CapsuleStepper';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: TrainingCategoryCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const TIME_PREFS = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

const DURATION_OPTIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '1 hr' },
  { id: '90', label: '1.5 hr' },
  { id: '120', label: '2 hr' },
];

export function TrainingCategoryCapsuleComponent({ card, onSubmit }: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [duration, setDuration] = useState('60');
  const [preferredTime, setPreferredTime] = useState('afternoon');

  const handleAdd = () => {
    if (!categoryName.trim()) return;
    const newCategory = {
      id: `cat_${Date.now()}`,
      label: categoryName.trim(),
      icon: 'barbell',
      color: colors.accent1,
      enabled: true,
      mode: 'days_per_week' as const,
      fixedDays: [],
      daysPerWeek: sessionsPerWeek,
      sessionDuration: parseInt(duration),
      preferredTime,
    };
    const updatedCategories = [
      ...card.currentCategories.map((c) => ({
        ...c,
        mode: 'days_per_week' as const,
        fixedDays: [] as number[],
        icon: c.id ? 'barbell' : 'barbell',
        color: colors.accent1,
      })),
      newCategory,
    ];
    onSubmit({
      type: 'training_category_capsule',
      toolName: 'update_schedule_rules',
      toolInput: { training_categories: updatedCategories },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add Training Category</Text>

      {card.currentCategories.length > 0 && (
        <View style={styles.existingRow}>
          {card.currentCategories.map((c) => (
            <View key={c.id} style={[styles.existingPill, !c.enabled && styles.disabledPill]}>
              <Text style={styles.existingText}>{c.label}</Text>
              <Text style={styles.existingMeta}>{c.daysPerWeek}x/wk</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <Text style={styles.label}>Category Name</Text>
        <View style={styles.textInputWrap}>
          <TextInput
            style={{ color: colors.textOnDark, fontFamily: 'Poppins', fontSize: 14, flex: 1 }}
            placeholder="e.g. Speed, Strength, Recovery..."
            placeholderTextColor="rgba(245,243,237,0.3)"
            value={categoryName}
            onChangeText={setCategoryName}
          />
        </View>
      </View>

      <CapsuleStepper label="Sessions/week" value={sessionsPerWeek} onChange={setSessionsPerWeek} min={1} max={7} />
      <PillSelector options={DURATION_OPTIONS} selected={duration} onSelect={setDuration} label="Duration" />
      <PillSelector options={TIME_PREFS} selected={preferredTime} onSelect={setPreferredTime} label="Preferred Time" />

      <CapsuleSubmitButton title="Add Category" disabled={!categoryName.trim()} onPress={handleAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  label: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.textInactive },
  inputRow: { gap: 4 },
  textInputWrap: { backgroundColor: colors.inputBackground, borderRadius: borderRadius.lg, paddingHorizontal: spacing.compact, paddingVertical: 8, borderWidth: 1, borderColor: colors.creamMuted },
  existingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  existingPill: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: colors.accentMuted, paddingVertical: 4, paddingHorizontal: 10, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.accentBorder },
  disabledPill: { opacity: 0.4 },
  existingText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.accent1 },
  existingMeta: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textInactive },
});
