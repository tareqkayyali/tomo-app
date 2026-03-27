/**
 * CapsuleDayPicker — Day-of-week multi-select pills for capsule forms.
 * Days are 0-6 (Sunday=0, Saturday=6).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../../theme';

const DAYS = [
  { id: 0, short: 'Sun' },
  { id: 1, short: 'Mon' },
  { id: 2, short: 'Tue' },
  { id: 3, short: 'Wed' },
  { id: 4, short: 'Thu' },
  { id: 5, short: 'Fri' },
  { id: 6, short: 'Sat' },
];

interface CapsuleDayPickerProps {
  label?: string;
  selected: number[];
  onChange: (days: number[]) => void;
}

export function CapsuleDayPicker({ label, selected, onChange }: CapsuleDayPickerProps) {
  const toggleDay = (day: number) => {
    if (selected.includes(day)) {
      onChange(selected.filter(d => d !== day));
    } else {
      onChange([...selected, day].sort());
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {DAYS.map(day => {
          const isSelected = selected.includes(day.id);
          return (
            <Pressable
              key={day.id}
              onPress={() => toggleDay(day.id)}
              style={[styles.dayPill, isSelected && styles.dayPillSelected]}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                {day.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textInactive,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.chipBackground,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  dayPillSelected: {
    borderColor: colors.accent1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  dayText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  dayTextSelected: {
    color: colors.accent1,
  },
});
