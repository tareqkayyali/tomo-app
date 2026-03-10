/**
 * ShotSelector — 8 shot chips for selecting which shots were practiced.
 * Spring scale on selection, color-coded when active.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useScaleOnPress } from '../hooks/useAnimations';
import { SHOT_DEFINITIONS } from '../services/padelMockData';
import { SHOT_ORDER } from '../types/padel';
import { colors, fontFamily, borderRadius, spacing } from '../theme';
import type { ShotType } from '../types/padel';

interface ShotSelectorProps {
  selected: ShotType[];
  onToggle: (shot: ShotType) => void;
}

function ShotChip({
  shot,
  isSelected,
  onToggle,
}: {
  shot: ShotType;
  isSelected: boolean;
  onToggle: (shot: ShotType) => void;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useScaleOnPress(0.93);
  const def = SHOT_DEFINITIONS[shot];

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => onToggle(shot)}
        style={[
          styles.chip,
          isSelected && styles.chipSelected,
        ]}
      >
        <Ionicons
          name={def.icon as any}
          size={16}
          color={isSelected ? '#FFFFFF' : colors.textInactive}
        />
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
          {def.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function ShotSelector({ selected, onToggle }: ShotSelectorProps) {
  return (
    <View style={styles.container}>
      {SHOT_ORDER.map((shot) => (
        <ShotChip
          key={shot}
          shot={shot}
          isSelected={selected.includes(shot)}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipSelected: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontFamily: fontFamily.semiBold,
  },
});
