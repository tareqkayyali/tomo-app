/**
 * Notification Settings Screen
 * Toggle each notification type on/off, set daily reminder time.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../services/api';
import {
  registerForPushNotifications,
  scheduleDailyReminder,
  cancelDailyReminder,
  parseTime,
} from '../services/notifications';
import type { NotificationPreferences } from '../types';

// ---------------------------------------------------------------------------
// Time presets for the simple time picker
// ---------------------------------------------------------------------------

const TIME_PRESETS = [
  '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleRow({ icon, label, subtitle, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <View style={styles.toggleIconWrap}>
          <Ionicons name={icon} size={20} color={value ? colors.accent1 : colors.textInactive} />
        </View>
        <View style={styles.toggleTextCol}>
          <Text style={styles.toggleLabel}>{label}</Text>
          <Text style={styles.toggleSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accent1 }}
        thumbColor={colors.cardLight}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences + register for push on mount
  useEffect(() => {
    getNotificationSettings()
      .then((res) => setPrefs(res.preferences))
      .catch(() => {
        // Use defaults if backend unreachable
        setPrefs({
          userId: '',
          dailyReminder: true,
          dailyReminderTime: '07:00',
          streakReminders: true,
          milestoneAlerts: true,
          redDayGuidance: true,
          weeklySummary: true,
        });
      })
      .finally(() => setIsLoading(false));

    // Non-blocking push token registration
    registerForPushNotifications().catch(() => {});
  }, []);

  const handleToggle = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      if (!prefs) return;

      // Optimistic update
      setPrefs({ ...prefs, [key]: value });

      try {
        const res = await updateNotificationSettings({ [key]: value });
        setPrefs(res.preferences);

        // Handle local scheduling for daily reminder
        if (key === 'dailyReminder') {
          if (value) {
            const { hour, minute } = parseTime(prefs.dailyReminderTime);
            await scheduleDailyReminder(hour, minute);
          } else {
            await cancelDailyReminder();
          }
        }
      } catch {
        // Revert on failure
        setPrefs({ ...prefs, [key]: !value });
      }
    },
    [prefs],
  );

  const handleTimeChange = useCallback(() => {
    if (!prefs) return;

    Alert.alert(
      'Reminder Time',
      'Choose when to receive your daily check-in reminder:',
      [
        ...TIME_PRESETS.map((time) => ({
          text: time,
          onPress: async () => {
            setPrefs({ ...prefs, dailyReminderTime: time });
            try {
              const res = await updateNotificationSettings({ dailyReminderTime: time });
              setPrefs(res.preferences);

              // Re-schedule local notification with new time
              if (prefs.dailyReminder) {
                const { hour, minute } = parseTime(time);
                await scheduleDailyReminder(hour, minute);
              }
            } catch {
              // Revert
              setPrefs(prefs);
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [prefs]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent1} />
        </View>
      </SafeAreaView>
    );
  }

  if (!prefs) return null;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          {/* 1. Daily Check-in Reminder */}
          <ToggleRow
            icon="alarm-outline"
            label="Daily Check-in Reminder"
            subtitle={prefs.dailyReminder ? `Every day at ${prefs.dailyReminderTime}` : 'Off'}
            value={prefs.dailyReminder}
            onValueChange={(val) => handleToggle('dailyReminder', val)}
          />

          {/* Time selector (only shown when daily reminder is on) */}
          {prefs.dailyReminder && (
            <Pressable onPress={handleTimeChange} style={styles.timeRow}>
              <Text style={styles.timeLabel}>Reminder Time</Text>
              <View style={styles.timeBadge}>
                <Text style={styles.timeValue}>{prefs.dailyReminderTime}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textInactive} />
              </View>
            </Pressable>
          )}

          <View style={styles.divider} />

          {/* 2. Streak at Risk */}
          <ToggleRow
            icon="flame-outline"
            label="Streak at Risk"
            subtitle="Alert at 8 PM if no check-in"
            value={prefs.streakReminders}
            onValueChange={(val) => handleToggle('streakReminders', val)}
          />

          <View style={styles.divider} />

          {/* 3. Milestone Achieved */}
          <ToggleRow
            icon="trophy-outline"
            label="Milestone Achieved"
            subtitle="When you unlock a new reward"
            value={prefs.milestoneAlerts}
            onValueChange={(val) => handleToggle('milestoneAlerts', val)}
          />

          <View style={styles.divider} />

          {/* 4. REST Day Guidance */}
          <ToggleRow
            icon="heart-outline"
            label="Rest Day Guidance"
            subtitle="When your body needs rest"
            value={prefs.redDayGuidance}
            onValueChange={(val) => handleToggle('redDayGuidance', val)}
          />

          <View style={styles.divider} />

          {/* 5. Weekly Summary */}
          <ToggleRow
            icon="stats-chart-outline"
            label="Weekly Summary"
            subtitle="Sunday evening recap"
            value={prefs.weeklySummary}
            onValueChange={(val) => handleToggle('weeklySummary', val)}
          />
        </View>

        <Text style={styles.footnote}>
          Push notifications require a custom build. Local reminders work in Expo Go.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },

  // ── Toggle Row ──────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  toggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.textOnDark,
    fontFamily: fontFamily.medium,
  },
  toggleSubtitle: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginTop: 2,
  },

  // ── Time selector ───────────────────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingLeft: 52, // Align with text (icon wrap 36 + margin 16)
    marginBottom: spacing.xs,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.textInactive,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  timeValue: {
    ...typography.body,
    color: colors.accent1,
    fontFamily: fontFamily.medium,
  },

  // ── Divider ─────────────────────────────────────────────────────────
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Footnote ────────────────────────────────────────────────────────
  footnote: {
    ...typography.metadataSmall,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
