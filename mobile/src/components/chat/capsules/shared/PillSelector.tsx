/**
 * PillSelector — Flex-wrap pill row for capsule selection inputs.
 * No horizontal scrolling (conflicts with page swiping).
 * Pills wrap to next line when they overflow.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../../../../theme/colors';
import { borderRadius } from '../../../../theme';
import { fontFamily } from '../../../../theme';

interface PillOption {
  id: string;
  label: string;
}

interface PillSelectorProps {
  options: PillOption[];
  selected?: string;
  onSelect: (id: string) => void;
  label?: string;
}

export function PillSelector({ options, selected, onSelect, label }: PillSelectorProps) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.pillRow}>
        {options.map((option) => {
          const isSelected = option.id === selected;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={({ pressed }) => [
                styles.pill,
                isSelected && styles.pillSelected,
                pressed && styles.pillPressed,
              ]}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                {option.label}
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    backgroundColor: colors.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pillSelected: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  pillTextSelected: {
    color: colors.accent1,
  },
});
