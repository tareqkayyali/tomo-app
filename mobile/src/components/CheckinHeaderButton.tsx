/**
 * CheckinHeaderButton — Prominent glowing header CTA for daily check-in.
 *
 * Sits in the header row next to NotificationBell + HeaderProfileButton.
 * When check-in is pending: orange glow + breathing animation + red dot badge.
 * When done: green-tinted icon, no glow, no badge.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlowWrapper } from './GlowWrapper';
import { useTheme } from '../hooks/useTheme';

interface CheckinHeaderButtonProps {
  needsCheckin: boolean;
  onPress: () => void;
}

export function CheckinHeaderButton({ needsCheckin, onPress }: CheckinHeaderButtonProps) {
  const { colors } = useTheme();

  const button = (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: needsCheckin
            ? colors.accent1 + '26' // 15% opacity orange
            : colors.glass,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={needsCheckin ? 'pulse' : 'checkmark-circle'}
        size={22}
        color={needsCheckin ? colors.accent1 : '#30D158'}
      />
      {/* Red dot badge when check-in needed */}
      {needsCheckin && <View style={styles.badge} />}
    </Pressable>
  );

  if (needsCheckin) {
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
    backgroundColor: '#E74C3C',
  },
});
