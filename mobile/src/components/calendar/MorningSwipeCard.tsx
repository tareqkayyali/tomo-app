/**
 * MorningSwipeCard — Swipe-to-confirm card for the morning planning ritual.
 *
 * The user drags the card horizontally. When translateX exceeds 40 % of the
 * card width, the confirmation fires and a compact "Confirmed" badge replaces
 * the card.
 *
 * Uses React Native's built-in PanResponder for the gesture (no external
 * gesture handler dependency required) combined with react-native-reanimated
 * for smooth spring/timing animations.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, PanResponder } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { SmartIcon } from '../SmartIcon';

import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';
import { fontFamily } from '../../theme/typography';
import { GlassCard } from '../GlassCard';
import { getIntensityConfig } from '../../utils/calendarHelpers';
import type { ThemeColors } from '../../theme/colors';
import type { CalendarEvent, Plan } from '../../types';

// ─── Props ─────────────────────────────────────────────────────────────────

interface MorningSwipeCardProps {
  events: CalendarEvent[];
  plan: Plan | null;
  planningStreak: number;
  onConfirm: () => void;
  onExpand: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function MorningSwipeCard({
  events,
  plan,
  planningStreak,
  onConfirm,
  onExpand,
}: MorningSwipeCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── State ────────────────────────────────────────────────────────────

  const [confirmed, setConfirmed] = useState(false);
  const cardWidthRef = useRef(0);

  // ── Shared Values ────────────────────────────────────────────────────

  const translateX = useSharedValue(0);
  const cardHeight = useSharedValue<number | null>(null);
  const confirmOpacity = useSharedValue(0);

  // Repeating pulse for the chevron hint
  const chevronPulse = useSharedValue(0);

  // Start the pulse animation on first render
  React.useEffect(() => {
    chevronPulse.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
      false,
    );
  }, [chevronPulse]);

  // ── Layout ───────────────────────────────────────────────────────────

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      cardWidthRef.current = width;
      if (cardHeight.value === null) {
        cardHeight.value = height;
      }
    },
    [cardHeight],
  );

  // ── Confirmation callback ────────────────────────────────────────────

  const handleConfirmed = useCallback(() => {
    setConfirmed(true);
    onConfirm();
  }, [onConfirm]);

  // ── PanResponder (built-in RN gesture) ───────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        const cw = cardWidthRef.current;
        // Clamp to [0, cardWidth]
        translateX.value = Math.max(0, Math.min(gestureState.dx, cw));
      },
      onPanResponderRelease: (_, gestureState) => {
        const cw = cardWidthRef.current;
        if (cw > 0 && translateX.value > cw * 0.4) {
          // Confirmed — slide to full width, then collapse
          translateX.value = withTiming(cw, { duration: 200 }, (finished) => {
            if (finished) {
              confirmOpacity.value = withTiming(1, { duration: 250 });
              if (cardHeight.value !== null) {
                cardHeight.value = withTiming(52, { duration: 300 });
              }
              runOnJS(handleConfirmed)();
            }
          });
        } else {
          // Snap back
          translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
        }
      },
      onPanResponderTerminate: () => {
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      },
    }),
  ).current;

  // ── Animated Styles ──────────────────────────────────────────────────

  const swipeTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const progressOverlayStyle = useAnimatedStyle(() => {
    const cw = cardWidthRef.current || 1;
    const progress = translateX.value / cw;
    return {
      opacity: interpolate(progress, [0, 0.4, 1], [0, 0.15, 0.3], Extrapolation.CLAMP),
    };
  });

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chevronPulse.value }],
  }));

  const containerAnimStyle = useAnimatedStyle(() => {
    if (cardHeight.value === null) return {};
    return { height: cardHeight.value, overflow: 'hidden' as const };
  });

  const confirmedBadgeStyle = useAnimatedStyle(() => ({
    opacity: confirmOpacity.value,
  }));

  // ── Derived Content ──────────────────────────────────────────────────

  const eventCount = events.length;
  const summaryText =
    eventCount === 0
      ? 'No events today'
      : eventCount === 1
        ? '1 event today'
        : `${eventCount} events today`;

  const intensityConfig =
    plan?.recommendedIntensity
      ? getIntensityConfig(plan.recommendedIntensity)
      : null;

  // ── Confirmed State ──────────────────────────────────────────────────

  if (confirmed) {
    return (
      <Animated.View style={[styles.confirmedContainer, containerAnimStyle]}>
        <Animated.View style={[styles.confirmedBadge, confirmedBadgeStyle]}>
          <SmartIcon name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.confirmedText}>Confirmed</Text>
          {planningStreak > 0 && (
            <Text style={styles.confirmedStreak}>
              {planningStreak} day streak
            </Text>
          )}
        </Animated.View>
      </Animated.View>
    );
  }

  // ── Main Card ────────────────────────────────────────────────────────

  return (
    <Animated.View
      style={containerAnimStyle}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <GlassCard>
        {/* Progress overlay */}
        <Animated.View
          style={[styles.progressOverlay, progressOverlayStyle]}
          pointerEvents="none"
        />

        {/* Top row — greeting */}
        <View style={styles.topRow}>
          <SmartIcon
            name="sunny-outline"
            size={20}
            color={colors.accent1}
            style={styles.sunIcon}
          />
          <Text style={styles.greetingText}>Good morning</Text>
        </View>

        {/* Summary */}
        <Text style={styles.summaryText}>{summaryText}</Text>

        {/* Intensity badge */}
        {intensityConfig && (
          <View
            style={[
              styles.intensityBadge,
              { backgroundColor: intensityConfig.bgColor },
            ]}
          >
            <SmartIcon
              name={intensityConfig.icon as any}
              size={14}
              color={intensityConfig.color}
            />
            <Text
              style={[styles.intensityLabel, { color: intensityConfig.color }]}
            >
              {intensityConfig.label}
            </Text>
          </View>
        )}

        {/* Swipe affordance */}
        <Animated.View style={[styles.swipeRow, swipeTrackStyle]}>
          <Animated.View style={chevronAnimStyle}>
            <SmartIcon
              name="chevron-forward"
              size={20}
              color={colors.accent1}
            />
          </Animated.View>
          <Text style={styles.swipeText}>Swipe to confirm</Text>
        </Animated.View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Progress overlay (orange tint that grows with swipe)
    progressOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.accent1,
      borderRadius: borderRadius.lg,
    },

    // Top row
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    sunIcon: {
      marginRight: spacing.sm,
    },
    greetingText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textHeader,
    },

    // Summary
    summaryText: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.textMuted,
      marginBottom: spacing.compact,
    },

    // Intensity badge
    intensityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.compact,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    intensityLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
    },

    // Swipe row
    swipeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.compact,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    swipeText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textMuted,
    },

    // Confirmed state
    confirmedContainer: {
      borderRadius: borderRadius.lg,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    confirmedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    confirmedText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.success,
    },
    confirmedStreak: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginLeft: 'auto',
    },
  });
}
