/**
 * DayLockButton — Pill button to lock/unlock a day's calendar.
 *
 * Unlocked: outline pill with open lock icon
 * Locked: filled green pill with closed lock + checkmark
 */

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily, spacing } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

interface DayLockButtonProps {
  isLocked: boolean;
  isLoading?: boolean;
  onToggle: () => void;
}

export function DayLockButton({ isLocked, isLoading, onToggle }: DayLockButtonProps) {
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <Loader size="sm" style={styles.loader} />
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.pill,
        isLocked ? styles.pillLocked : styles.pillUnlocked,
        { opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {isLocked ? (
        <>
          <LinearGradient
            colors={['#C8DCC3', '#9AB896', '#7A9B76', '#4F6B4C']}
            locations={[0, 0.35, 0.7, 1]}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['rgba(245,243,237,0.18)', 'rgba(245,243,237,0.05)', 'transparent']}
            locations={[0, 0.32, 0.65]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <SmartIcon name="lock-closed" size={12} color="#F5F3ED" />
          <Text style={[styles.pillText, { color: '#F5F3ED' }]}>Day Locked</Text>
          <SmartIcon name="checkmark" size={12} color="#F5F3ED" />
        </>
      ) : (
        <>
          <SmartIcon name="lock-open-outline" size={12} color={colors.textSecondary} />
          <Text style={[styles.pillText, { color: colors.textSecondary }]}>Lock Day</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.compact,
    minHeight: 32,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  pillLocked: {
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.16)',
  },
  pillUnlocked: {
    backgroundColor: 'rgba(154,184,150,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.12)',
  },
  pillText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  loader: {
    marginHorizontal: 8,
  },
});
