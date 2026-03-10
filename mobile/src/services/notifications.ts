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
import { updateUser } from './api';

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

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Store token on backend
    await updateUser({ fcmToken: token } as Partial<import('../types').User>);

    // Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'tomo',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    return token;
  } catch {
    // Silently fail — push not available (e.g. Expo Go without project ID)
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local scheduled notifications
// ---------------------------------------------------------------------------

const DAILY_REMINDER_ID = 'tomo-daily-reminder';
const STREAK_AT_RISK_ID = 'tomo-streak-at-risk';

/**
 * Schedule a daily local notification at the specified time.
 * Replaces any existing daily reminder.
 */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  // Cancel existing first
  await cancelDailyReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'Time to Check In',
      body: 'Ready for your daily check-in? It takes just 15 seconds.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/**
 * Cancel the daily reminder notification.
 */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

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

/**
 * Parse a time string "HH:mm" into { hour, minute }.
 */
export function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hour: h, minute: m };
}
