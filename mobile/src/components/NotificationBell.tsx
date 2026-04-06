/**
 * NotificationBell — Header icon with unread count badge.
 *
 * Shows unread count from the notification center.
 * Pulses when any P1 critical notification is unread.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SmartIcon } from './SmartIcon';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { colors as themeColors } from '../theme/colors';

const AnimatedView = Animated.createAnimatedComponent(View);

export function NotificationBell() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { centerUnreadCount, hasCriticalUnread } = useNotifications();

  const totalUnread = centerUnreadCount;

  // Pulse animation for critical notifications
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (hasCriticalUnread) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 400 }),
          withTiming(1.0, { duration: 400 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(pulseScale);
  }, [hasCriticalUnread]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        try {
          navigation.navigate('Notifications' as never);
        } catch (err) {
          console.warn('[NotificationBell] Navigation failed:', err);
        }
      }}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.7 : 1 }]}
    >
      <SmartIcon name="notifications-outline" size={22} color={colors.textOnDark} />
      {totalUnread > 0 && (
        <AnimatedView
          style={[
            styles.badge,
            { backgroundColor: colors.error },
            hasCriticalUnread ? pulseStyle : undefined,
          ]}
        >
          <Text style={styles.badgeText}>
            {totalUnread > 99 ? '99+' : String(totalUnread)}
          </Text>
        </AnimatedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: themeColors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
});
