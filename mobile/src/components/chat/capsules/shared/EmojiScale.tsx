/**
 * EmojiScale — Emoji-driven rating scale for check-in capsule (energy, soreness).
 */

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../../../../theme/colors';
import { borderRadius } from '../../../../theme';
import { fontFamily } from '../../../../theme';

interface EmojiScaleProps {
  options: Array<{ value: number; emoji: string }>;
  selected?: number;
  onSelect: (value: number) => void;
  label?: string;
}

export function EmojiScale({ options, selected, onSelect, label }: EmojiScaleProps) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {options.map((opt) => {
          const isSelected = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={({ pressed }) => [
                styles.emojiButton,
                isSelected && styles.emojiButtonSelected,
                pressed && styles.emojiButtonPressed,
              ]}
            >
              {opt.emoji ? <Text style={styles.emoji}>{opt.emoji}</Text> : null}
              <Text style={[styles.value, isSelected && styles.valueSelected]}>
                {opt.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emojiButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 42,
    gap: 1,
  },
  emojiButtonSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.accentMuted,
  },
  emojiButtonPressed: {
    opacity: 0.7,
  },
  emoji: {
    fontSize: 20,
  },
  value: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textInactive,
  },
  valueSelected: {
    color: colors.accent1,
  },
});
