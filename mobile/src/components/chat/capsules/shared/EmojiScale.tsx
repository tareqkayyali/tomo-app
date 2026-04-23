/**
 * EmojiScale — rating scale for capsule forms (energy, soreness, etc.).
 *
 * Named historically, but renders pure number chips via the shared
 * <NumberChipRow> primitive. The emoji field on each option is
 * accepted for API compatibility and intentionally NOT rendered
 * (project-wide no-emoji rule).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NumberChipRow, T } from '../../tomo';

interface EmojiScaleProps {
  /** Options from the capsule; emoji is accepted but ignored. */
  options: Array<{ value: number; emoji?: string }>;
  selected?: number;
  onSelect: (value: number) => void;
  label?: string;
}

export function EmojiScale({
  options,
  selected,
  onSelect,
  label,
}: EmojiScaleProps) {
  const values = options.map((o) => o.value);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <NumberChipRow values={values} selected={selected} onPick={onSelect} />
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
});
