/**
 * Notifications Service
 * Manages expo-notifications setup, push token registration,
 * and local scheduled notifications.
 *
 * Local scheduling (daily reminder, streak at risk) works in Expo Go.
 * FCM push tokens require a custom dev build.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { registerPushToken } from './api';

const EXPO_PROJECT_ID = '7cd0fd4e-b7fa-4bd0-8eb5-b15808e224cc';

// ---------------------------------------------------------------------------
// Configure foreground notification handling
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Push token registration
// ---------------------------------------------------------------------------

/**
 * Request notification permissions and register for push notifications.
 * Stores FCM token on the backend user profile.
 * Returns the Expo push token string, or null if unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens don't work on simulators
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const token = tokenData.data;

    // Store token in player_push_tokens table (matches pushDelivery.ts reads)
    await registerPushToken(token, Platform.OS);

    // Android notification channels — one per notification category
    if (Platform.OS === 'android') {
      const channels: Array<{ id: string; name: string; importance: number; sound: string | null }> = [
        { id: 'tomo-critical', name: 'Critical Alerts', importance: Notifications.AndroidImportance.MAX, sound: 'default' },
        { id: 'tomo-training', name: 'Training', importance: Notifications.AndroidImportance.HIGH, sound: 'default' },
        { id: 'tomo-academic', name: 'Academic', importance: Notifications.AndroidImportance.HIGH, sound: 'default' },
        { id: 'tomo-coaching', name: 'Coaching', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' },
        { id: 'tomo-triangle', name: 'Coach & Parent', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' },
        { id: 'tomo-cv', name: 'CV Updates', importance: Notifications.AndroidImportance.LOW, sound: null },
        { id: 'tomo-system', name: 'System', importance: Notifications.AndroidImportance.LOW, sound: null },
      ];
      await Promise.all(
        channels.map((ch) =>
          Notifications.setNotificationChannelAsync(ch.id, {
            name: ch.name,
            importance: ch.importance,
            sound: ch.sound,
          })
        )
      );
    }

    return token;
  } catch (err) {
    console.warn('[notifications] Push registration not available:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local scheduled notifications
// ---------------------------------------------------------------------------

const STREAK_AT_RISK_ID = 'tomo-streak-at-risk';

/**
 * Schedule a streak-at-risk local notification for 8 PM today.
 * Only schedules if 8 PM hasn't passed yet.
 */
export async function scheduleStreakAtRiskNotification(currentStreak: number): Promise<void> {
  await cancelStreakAtRiskNotification();

  const now = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0);

  // Don't schedule if 8 PM already passed
  if (now >= target) return;

  const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_AT_RISK_ID,
    content: {
      title: 'Streak at Risk!',
      body: `Don't break your ${currentStreak}-day streak! Quick check-in takes 15 seconds.`,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
      repeats: false,
    },
  });
}

/**
 * Cancel the streak-at-risk notification.
 */
export async function cancelStreakAtRiskNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STREAK_AT_RISK_ID);
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

