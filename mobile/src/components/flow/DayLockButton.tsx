/**
 * DayLockButton — Pill button to lock/unlock a day's calendar.
 *
 * Unlocked: outline pill with open lock icon
 * Locked: filled green pill with closed lock + checkmark
 */

import React from 'react';
import { Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { borderRadius, fontFamily, spacing } from '../../theme';

interface DayLockButtonProps {
  isLocked: boolean;
  isLoading?: boolean;
  onToggle: () => void;
}

export function DayLockButton({ isLocked, isLoading, onToggle }: DayLockButtonProps) {
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <ActivityIndicator size="small" color={colors.textInactive} style={styles.loader} />
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.pill,
        isLocked
          ? styles.pillLocked
          : [styles.pillUnlocked, { borderColor: colors.textInactive + '50' }],
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <SmartIcon
        name={isLocked ? 'lock-closed' : 'lock-open-outline'}
        size={12}
        color={isLocked ? '#FFF' : colors.textSecondary}
      />
      <Text
        style={[
          styles.pillText,
          { color: isLocked ? '#FFF' : colors.textSecondary },
        ]}
      >
        {isLocked ? 'Day Locked' : 'Lock Day'}
      </Text>
      {isLocked && (
        <SmartIcon name="checkmark" size={12} color="#FFF" />
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
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  pillLocked: {
    backgroundColor: '#2ED573',
  },
  pillUnlocked: {
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  loader: {
    marginHorizontal: 8,
  },
});
