/**
 * SwipeableNotificationCard — Wraps NotificationCard with swipe gestures.
 *
 * Swipe right → Dismiss (non-critical only)
 * Swipe left  → Mark as read
 *
 * Uses react-native-gesture-handler Swipeable.
 */

import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SmartIcon } from '../SmartIcon';
import { NotificationCard, type NotificationData } from './NotificationCard';
import { spacing } from '../../theme';
import { colors } from '../../theme/colors';

interface SwipeableNotificationCardProps {
  notification: NotificationData;
  index: number;
  onPrimaryAction: (n: NotificationData) => void;
  onSecondaryAction: (n: NotificationData) => void;
  onDismiss: (n: NotificationData) => void;
  onPress: (n: NotificationData) => void;
  onMarkRead: (n: NotificationData) => void;
}

export function SwipeableNotificationCard({
  notification,
  index,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
  onPress,
  onMarkRead,
}: SwipeableNotificationCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const n = notification;

  // Critical notifications cannot be dismissed
  const canDismiss = n.category !== 'critical' && n.status !== 'acted' && n.status !== 'dismissed';
  const canMarkRead = n.status === 'unread';

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (!canDismiss) return null;

      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [80, 0],
      });

      return (
        <Animated.View style={[styles.swipeAction, styles.dismissAction, { transform: [{ translateX }] }]}>
          <SmartIcon name="close-circle" size={22} color={colors.textPrimary} />
          <Text style={styles.swipeText}>Dismiss</Text>
        </Animated.View>
      );
    },
    [canDismiss],
  );

  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (!canMarkRead) return null;

      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-80, 0],
      });

      return (
        <Animated.View style={[styles.swipeAction, styles.readAction, { transform: [{ translateX }] }]}>
          <SmartIcon name="checkmark-circle" size={22} color={colors.textPrimary} />
          <Text style={styles.swipeText}>Read</Text>
        </Animated.View>
      );
    },
    [canMarkRead],
  );

  const handleSwipeRight = useCallback(() => {
    if (canDismiss) {
      onDismiss(n);
      swipeableRef.current?.close();
    }
  }, [canDismiss, n, onDismiss]);

  const handleSwipeLeft = useCallback(() => {
    if (canMarkRead) {
      onMarkRead(n);
      swipeableRef.current?.close();
    }
  }, [canMarkRead, n, onMarkRead]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={canDismiss ? renderRightActions : undefined}
      renderLeftActions={canMarkRead ? renderLeftActions : undefined}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') handleSwipeRight();
        else if (direction === 'left') handleSwipeLeft();
      }}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <NotificationCard
        notification={n}
        index={index}
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
        onDismiss={onDismiss}
        onPress={onPress}
      />
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    paddingHorizontal: spacing.sm,
  },
  dismissAction: {
    backgroundColor: colors.textSecondary,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    marginRight: spacing.lg,
  },
  readAction: {
    backgroundColor: colors.accent,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    marginLeft: spacing.lg,
  },
  swipeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
