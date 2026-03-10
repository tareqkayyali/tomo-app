/**
 * CalendarViewSwitcher — 4-tab pill (Focus | Day | Week | Month)
 * Simple highlight on active tab, no sliding animation.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import type { ViewMode } from '../../hooks/useCalendarData';

const TABS: { key: ViewMode; label: string }[] = [
  { key: 'focus', label: 'Focus' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

interface Props {
  activeMode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
}

export function CalendarViewSwitcher({ activeMode, onChangeMode }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeMode === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChangeMode(tab.key)}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: colors.cardMuted,
      borderRadius: borderRadius.md,
      padding: 3,
      marginBottom: spacing.md,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md - 2,
    },
    tabActive: {
      backgroundColor: colors.accent1,
    },
    tabText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
    },
    tabTextActive: {
      color: '#FFFFFF',
      fontFamily: fontFamily.semiBold,
    },
  });
}
