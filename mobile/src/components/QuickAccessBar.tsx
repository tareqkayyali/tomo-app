/**
 * QuickAccessBar — Row of 36px glass-circle icon buttons for the header.
 *
 * Gen Z minimal: icons only, no text labels. Matches NotificationBell
 * and HeaderProfileButton sizing (36×36). Themed via useTheme().
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';
import { useTheme } from '../hooks/useTheme';
import { spacing } from '../theme';

export interface QuickAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accentColor?: string;
}

interface QuickAccessBarProps {
  actions: QuickAction[];
}

export function QuickAccessBar({ actions }: QuickAccessBarProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={4}
          style={({ pressed }) => [
            styles.circle,
            {
              backgroundColor: colors.glass,
              borderColor: colors.glassBorder,
            },
            pressed && styles.pressed,
          ]}
        >
          <SmartIcon
            name={action.icon}
            size={18}
            color={action.accentColor || colors.textOnDark}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
