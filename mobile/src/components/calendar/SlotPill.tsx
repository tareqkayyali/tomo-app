/**
 * SlotPill — Time suggestion pill for "Best Time" recommendations
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fontFamily, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import { format12h, minutesToTime } from '../../services/schedulingEngine';

interface SlotPillProps {
  startMin: number;
  endMin: number;
  score: number;
  reason: string;
  isBest?: boolean;
  selected?: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

export function SlotPill({
  startMin,
  endMin,
  score,
  reason,
  isBest,
  selected,
  onPress,
  colors,
}: SlotPillProps) {
  const timeLabel = format12h(minutesToTime(startMin));

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected
            ? colors.accent1 + '20'
            : isBest
            ? colors.accent1 + '14'
            : 'rgba(255,255,255,0.06)',
          borderColor: selected
            ? colors.accent1
            : isBest
            ? colors.accent1 + '50'
            : 'rgba(255,255,255,0.08)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {isBest && (
        <Ionicons name="sparkles" size={12} color={colors.accent1} />
      )}
      <Text
        style={[
          styles.timeText,
          {
            color: selected || isBest ? colors.accent1 : colors.textOnDark,
            fontFamily: isBest ? fontFamily.bold : fontFamily.medium,
          },
        ]}
      >
        {timeLabel}
      </Text>
      {isBest && (
        <View style={[styles.bestBadge, { backgroundColor: colors.accent1 }]}>
          <Text style={styles.bestText}>Best</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  timeText: {
    fontSize: 14,
  },
  bestBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  bestText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    color: '#FFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
