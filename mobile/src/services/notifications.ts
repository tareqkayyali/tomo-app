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
// Local scheduling DEPRECATED
// ---------------------------------------------------------------------------
//
// The backend cron (notifications.tick_daily_21 + tick_15min) owns ALL
// time-based notifications now. Device-local scheduling is disallowed
// because it bypasses the Notification Center database, causing pushes
// the athlete cannot see in-app afterwards.
//
// If you need a new time-based reminder, add it to scheduledTriggers.ts
// on the backend \u2014 that writes to athlete_notifications so it appears
// in the Center, respects quiet hours / fatigue / daily cap, and is
// admin-observable via cron_run_log.

/**
 * Cancel any residual scheduled notifications from previous app versions.
 * Safe to call repeatedly; idempotent.
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Non-fatal \u2014 old devices may not support this API
  }
}

