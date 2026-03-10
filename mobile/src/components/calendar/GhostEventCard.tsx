/**
 * GhostEventCard — Suggested (ghost) event card with dashed border
 * Visually distinct from real events: pulsing opacity, dashed border,
 * ghost colors, confirm/dismiss actions.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { GhostSuggestion } from '../../types';
import { getEventTypeColor } from '../../utils/calendarHelpers';

interface GhostEventCardProps {
  suggestion: GhostSuggestion;
  date: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function GhostEventCard({
  suggestion,
  date,
  onConfirm,
  onDismiss,
}: GhostEventCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const typeColor = getEventTypeColor(suggestion.type);

  // ── Pulse animation (opacity 0.6 -> 0.8 -> 0.6 over 3s) ──
  const pulseOpacity = useSharedValue(0.6);
  React.useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500 }),
        withTiming(0.6, { duration: 1500 }),
      ),
      -1, // infinite
      false,
    );
  }, [pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // ── Confirm tap: scale spring ──
  const confirmScale = useSharedValue(1);
  const confirmAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmScale.value }],
  }));

  const handleConfirm = () => {
    confirmScale.value = withSpring(0.95, { damping: 15, stiffness: 200 }, () => {
      confirmScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });
    onConfirm();
  };

  // ── Dismiss tap: slide left + fade ──
  const dismissX = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);
  const dismissAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dismissX.value }],
    opacity: dismissOpacity.value,
  }));

  const handleDismiss = () => {
    dismissX.value = withTiming(-300, { duration: 300 });
    dismissOpacity.value = withTiming(0, { duration: 300 }, () => {
      runOnJS(onDismiss)();
    });
  };

  return (
    <Animated.View style={[pulseStyle, dismissAnimStyle]}>
      <Animated.View style={confirmAnimStyle}>
        <GlassCard
          style={{
            ...styles.card,
            backgroundColor: colors.ghostBackground,
            borderColor: colors.ghostBorder,
          }}
        >
          {/* Left color bar */}
          <View
            style={[
              styles.colorBar,
              { backgroundColor: typeColor + '80' },
            ]}
          />

          <View style={styles.body}>
            {/* Suggested label */}
            <View style={styles.labelRow}>
              <Ionicons
                name="sparkles-outline"
                size={12}
                color={colors.accent2}
              />
              <Text style={styles.labelText}>Suggested</Text>
            </View>

            {/* Event name */}
            <Text style={styles.name} numberOfLines={1}>{suggestion.name}</Text>

            {/* Time if available */}
            {suggestion.startTime && (
              <Text style={styles.time}>
                {suggestion.startTime}
                {suggestion.endTime ? ` - ${suggestion.endTime}` : ''}
              </Text>
            )}

            {/* Pattern description */}
            <Text style={styles.pattern}>{suggestion.patternDescription}</Text>

            {/* Action buttons */}
            <View style={styles.actions}>
              <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
                <Text style={styles.confirmText}>Confirm</Text>
              </Pressable>
              <Pressable onPress={handleDismiss} style={styles.dismissBtn}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        </GlassCard>
      </Animated.View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      borderStyle: 'dashed',
      borderWidth: 1,
      opacity: 0.75,
      overflow: 'hidden',
      padding: 0,
    },
    colorBar: {
      width: 3,
      alignSelf: 'stretch',
    },
    body: {
      flex: 1,
      padding: spacing.compact,
      paddingLeft: spacing.md,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: spacing.xs,
    },
    labelText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.accent2,
    },
    name: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.ghostText,
      marginBottom: 2,
    },
    time: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.ghostText,
      marginBottom: 2,
    },
    pattern: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.ghostText,
      fontStyle: 'italic',
      marginBottom: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    confirmBtn: {
      backgroundColor: colors.accent1 + '18',
      paddingHorizontal: spacing.compact,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    confirmText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
    },
    dismissBtn: {
      paddingHorizontal: spacing.compact,
      paddingVertical: spacing.xs,
    },
    dismissText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}
