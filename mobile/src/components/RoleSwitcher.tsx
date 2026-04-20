/**
 * RoleSwitcher — Dev-only segmented control for switching between user roles.
 *
 * Renders 3 chips: Player | Coach | Parent
 * Uses glass morphism styling matching SportSwitcher pattern.
 * Active chip has orange→cyan gradient fill.
 * Only rendered when __DEV__ is true.
 *
 * Calls setDevRole() from useAuth context to trigger navigation fork change.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { fontFamily, spacing } from '../theme';
import type { UserRole } from '../types';

import { colors } from '../theme/colors';

// ═══ ROLE DEFINITIONS ═══

const ROLES: Array<{
  value: UserRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: 'player', label: 'Player', icon: 'person-outline' },
  { value: 'coach', label: 'Coach', icon: 'clipboard-outline' },
  { value: 'parent', label: 'Parent', icon: 'people-outline' },
];

// ═══ COMPONENT ═══

export function RoleSwitcher() {
  const { role, setDevRole } = useAuth();
  const { colors } = useTheme();

  // Only show in dev mode
  if (!__DEV__) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassBorder,
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Role switcher (dev)"
    >
      {ROLES.map((r) => {
        const isActive = role === r.value;
        return (
          <RoleSegment
            key={r.value}
            role={r}
            isActive={isActive}
            onPress={setDevRole}
          />
        );
      })}
    </View>
  );
}

// ═══ SEGMENT ═══

function RoleSegment({
  role: roleDef,
  isActive,
  onPress,
}: {
  role: (typeof ROLES)[number];
  isActive: boolean;
  onPress: (role: UserRole) => void;
}) {
  const { colors: themeColors } = useTheme();

  const handlePress = useCallback(() => {
    if (isActive) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(roleDef.value);
  }, [isActive, onPress, roleDef.value]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.segmentPressable}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${roleDef.label} role`}
    >
      {isActive ? (
        <LinearGradient
          colors={themeColors.gradientOrangeCyan}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.segmentActive}
        >
          <SmartIcon name={roleDef.icon} size={13} color={themeColors.textPrimary} />
          <Text style={styles.segmentTextActive}>{roleDef.label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.segmentInactive}>
          <SmartIcon name={roleDef.icon} size={13} color={themeColors.textInactive} />
          <Text style={[styles.segmentTextInactive, { color: themeColors.textInactive }]}>
            {roleDef.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ═══ STYLES ═══

const SWITCHER_HEIGHT = 32;
const SWITCHER_RADIUS = 16;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: SWITCHER_HEIGHT,
    borderRadius: SWITCHER_RADIUS,
    borderWidth: 1,
    padding: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  segmentPressable: {
    flex: 1,
  },
  segmentActive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SWITCHER_RADIUS - 2,
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  segmentInactive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SWITCHER_RADIUS - 2,
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  segmentTextActive: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  segmentTextInactive: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
