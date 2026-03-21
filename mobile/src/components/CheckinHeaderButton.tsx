/**
 * CheckinHeaderButton — Prominent header CTA for daily check-in.
 *
 * Three visual states:
 *   1. Needs checkin (no checkin today): orange glow + breathing + red dot badge
 *   2. Stale checkin (>18h old): amber icon + yellow dot badge (gentle nudge)
 *   3. Fresh checkin: green checkmark, no glow, no badge
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlowWrapper } from './GlowWrapper';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme';

interface CheckinHeaderButtonProps {
  needsCheckin: boolean;
  isStale?: boolean;
  checkinAgeHours?: number | null;
  onPress: () => void;
}

export function CheckinHeaderButton({ needsCheckin, isStale = false, checkinAgeHours, onPress }: CheckinHeaderButtonProps) {
  const { colors } = useTheme();

  // Determine visual state
  const showNeedsCheckin = needsCheckin;
  const showStale = !needsCheckin && isStale;
  const showFresh = !needsCheckin && !isStale;

  const iconName = showFresh
    ? 'checkmark-circle'
    : showStale
    ? 'time-outline'
    : 'pulse';

  const iconColor = showFresh
    ? colors.accent
    : showStale
    ? colors.warning
    : colors.accent1;

  const bgColor = showFresh
    ? colors.glass
    : showStale
    ? colors.warning + '1A' // 10% opacity
    : colors.accent1 + '26'; // 15% opacity

  const badgeColor = showNeedsCheckin
    ? colors.error
    : showStale
    ? colors.warning
    : null;

  const button = (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bgColor },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={iconName} size={22} color={iconColor} />
      {/* Badge dot */}
      {badgeColor && <View style={[styles.badge, { backgroundColor: badgeColor }]} />}
    </Pressable>
  );

  if (showNeedsCheckin) {
    return (
      <GlowWrapper glow="subtle" breathing>
        {button}
      </GlowWrapper>
    );
  }

  return button;
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
