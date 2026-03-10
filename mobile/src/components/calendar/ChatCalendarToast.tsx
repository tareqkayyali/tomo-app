/**
 * ChatCalendarToast — Top toast notification for chat-created calendar events.
 * Slides in from above, auto-dismisses after 4 seconds, tap to dismiss early.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily, shadows } from '../../theme';
import type { ThemeColors } from '../../theme/colors';

interface ChatCalendarToastProps {
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  onDismiss: () => void;
}

export function ChatCalendarToast({
  eventName,
  eventDate,
  eventTime,
  onDismiss,
}: ChatCalendarToastProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dismissed = useRef(false);

  const translateY = useSharedValue(-100);

  // ── Enter animation ──
  useEffect(() => {
    translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
  }, [translateY]);

  // ── Auto-dismiss after 4 seconds ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!dismissed.current) {
        dismiss();
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    translateY.value = withSpring(-100, { damping: 15, stiffness: 150 }, () => {
      runOnJS(onDismiss)();
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable onPress={dismiss} style={styles.inner}>
        <Ionicons
          name="calendar"
          size={20}
          color={colors.accent1}
          style={styles.icon}
        />
        <Animated.View style={styles.textContainer}>
          <Text style={styles.message} numberOfLines={2}>
            Tomo added &apos;{eventName}&apos; to your calendar
          </Text>
          {eventTime && (
            <Text style={styles.timeText}>{eventTime}</Text>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      backgroundColor: colors.glass,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent1,
      borderBottomLeftRadius: borderRadius.lg,
      borderBottomRightRadius: borderRadius.lg,
      ...shadows.md,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: spacing.xxl, // account for status bar
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    icon: {
      marginRight: spacing.compact,
    },
    textContainer: {
      flex: 1,
    },
    message: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
      lineHeight: 20,
    },
    timeText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
