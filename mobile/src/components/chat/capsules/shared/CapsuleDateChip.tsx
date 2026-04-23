/**
 * CapsuleDateChip — tappable date chip that cycles today ↔ tomorrow,
 * styled on the Tomo chat primitive tokens.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { T } from '../../tomo';

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

export function CapsuleDateChip({
  value,
  onChange,
  label,
}: CapsuleDateChipProps) {
  const handlePress = () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    onChange(value === today ? tomorrow : today);
  };
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Text style={styles.chipText}>{formatDateLabel(value)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.cream55,
    marginBottom: 2,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.sage,
    backgroundColor: T.sage08,
  },
  pressed: {
    opacity: 0.7,
  },
  chipText: {
    fontFamily: T.fontMedium,
    fontSize: 12,
    color: T.sageLight,
    letterSpacing: -0.1,
  },
});
