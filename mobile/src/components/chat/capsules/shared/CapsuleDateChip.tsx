/**
 * CapsuleDateChip — Tappable date chip that cycles Today → Tomorrow → custom.
 */

import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../../../../theme/colors';
import { borderRadius } from '../../../../theme';
import { fontFamily } from '../../../../theme';

interface CapsuleDateChipProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
}

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return 'Select date';

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';

  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Select date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CapsuleDateChip({ value, onChange, label }: CapsuleDateChipProps) {
  const handlePress = () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Cycle: today → tomorrow → today
    if (value === today) {
      onChange(tomorrow);
    } else {
      onChange(today);
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      >
        <Text style={styles.chipText}>{formatDateLabel(value)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textInactive,
  },
  chip: {
    backgroundColor: colors.chipBackground,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignSelf: 'flex-start',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent1,
  },
});
