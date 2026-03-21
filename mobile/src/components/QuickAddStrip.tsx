/**
 * QuickAddStrip — Floating action buttons on Plan tab
 *
 * Row of quick-add buttons: Training, Study, Match, Rest
 * Each opens the AddEvent screen with pre-filled type.
 *
 * Positioned at bottom of Plan tab, above tab bar.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';

type QuickAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
};

type QuickAddStripProps = {
  onAdd: (type: string) => void;
};

export function QuickAddStrip({ onAdd }: QuickAddStripProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const actions: QuickAction[] = [
    { key: 'training', icon: 'barbell-outline', label: 'Training', color: colors.accent1 },
    { key: 'study_block', icon: 'book-outline', label: 'Study', color: colors.info },
    { key: 'match', icon: 'football-outline', label: 'Match', color: colors.accent2 },
    { key: 'recovery', icon: 'leaf-outline', label: 'Rest', color: colors.readinessGreen },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={styles.button}
          onPress={() => onAdd(action.key)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${action.color}20` }]}>
            <Ionicons name={action.icon} size={18} color={action.color} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: colors.backgroundElevated,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    button: {
      alignItems: 'center',
      gap: 4,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      color: colors.textInactive,
    },
  });
}
