/**
 * Notification Settings Screen
 *
 * Category-based push toggles (7 categories), quiet hours picker,
 * daily push cap slider. Persisted to athlete_notification_preferences.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { TomoLoader, NOTIFICATIONS_LOADER_MESSAGES } from '../components/TomoLoader';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { apiRequest } from '../services/api';
import { colors } from '../theme/colors';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { useNavigation } from '@react-navigation/native';

import {
  registerForPushNotifications,
} from '../services/notifications';

// ─── Types ────────────────────────────────────────────────────────────

interface CenterPrefs {
  quiet_hours_start: string;
  quiet_hours_end: string;
  push_critical: boolean;
  push_training: boolean;
  push_coaching: boolean;
  push_academic: boolean;
  push_triangle: boolean;
  push_cv: boolean;
  push_system: boolean;
  max_push_per_day: number;
}

const DEFAULT_PREFS: CenterPrefs = {
  quiet_hours_start: '23:00',
  quiet_hours_end: '07:00',
  push_critical: true,
  push_training: true,
  push_coaching: true,
  push_academic: true,
  push_triangle: true,
  push_cv: false,
  push_system: false,
  max_push_per_day: 5,
};

const CATEGORY_TOGGLES: Array<{
  key: keyof CenterPrefs;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  locked?: boolean;
}> = [
  { key: 'push_critical', label: 'Critical Alerts', subtitle: 'Load warnings, injury risk, wellness flags', icon: 'flash', color: colors.textSecondary, locked: true },
  { key: 'push_training', label: 'Training', subtitle: 'Journal nudges, session reminders, streak risk', icon: 'calendar', color: colors.accent },
  { key: 'push_coaching', label: 'Coaching', subtitle: 'New recommendations, personal bests, milestones', icon: 'star', color: colors.accent },
  { key: 'push_academic', label: 'Academic', subtitle: 'Exam alerts, dual load spikes, schedule conflicts', icon: 'book', color: colors.textSecondary },
  { key: 'push_triangle', label: 'Triangle', subtitle: 'Coach assessments, parent flags', icon: 'diamond', color: colors.textSecondary },
  { key: 'push_cv', label: 'CV', subtitle: 'Profile views, completeness milestones', icon: 'person-circle', color: colors.textSecondary },
  { key: 'push_system', label: 'System', subtitle: 'App updates, feature tips', icon: 'information-circle', color: colors.textSecondary },
];

const QUIET_HOUR_OPTIONS = [
  '21:00', '22:00', '23:00', '00:00',
];

const WAKE_HOUR_OPTIONS = [
  '06:00', '07:00', '08:00', '09:00',
];


// ─── Component ────────────────────────────────────────────────────────

export function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [prefs, setPrefs] = useState<CenterPrefs>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPrefs();
    registerForPushNotifications().catch((err) => {
      console.warn('[NotificationSettings] Push registration failed:', err);
    });
  }, []);

  async function loadPrefs() {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ preferences: CenterPrefs }>('/api/v1/notifications/settings');
      setPrefs(res.preferences ?? DEFAULT_PREFS);
    } catch {
      setPrefs(DEFAULT_PREFS);
    } finally {
      setIsLoading(false);
    }
  }

  const savePrefs = useCallback(async (updates: Partial<CenterPrefs>) => {
    const newPrefs = { ...prefs, ...updates };
    setPrefs(newPrefs);
    try {
      await apiRequest('/api/v1/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.warn('[NotificationSettings] Save failed:', err);
      setPrefs(prefs); // revert
      if (Platform.OS === 'web') {
        window.alert('Could not save preference. Please try again.');
      } else {
        Alert.alert('Error', 'Could not save preference. Please try again.');
      }
    }
  }, [prefs]);

  const handleQuietHoursStart = useCallback(() => {
    if (Platform.OS === 'web') {
      const choice = window.prompt(
        'Quiet hours start:\n' + QUIET_HOUR_OPTIONS.map((t, i) => `${i + 1}. ${t}`).join('\n'),
      );
      if (choice) {
        const idx = parseInt(choice, 10) - 1;
        const time = idx >= 0 && idx < QUIET_HOUR_OPTIONS.length ? QUIET_HOUR_OPTIONS[idx] : choice.trim();
        savePrefs({ quiet_hours_start: time });
      }
    } else {
      Alert.alert('Quiet Hours Start', 'No push notifications after:', [
        ...QUIET_HOUR_OPTIONS.map((t) => ({ text: t, onPress: () => savePrefs({ quiet_hours_start: t }) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [savePrefs]);

  const handleQuietHoursEnd = useCallback(() => {
    if (Platform.OS === 'web') {
      const choice = window.prompt(
        'Quiet hours end:\n' + WAKE_HOUR_OPTIONS.map((t, i) => `${i + 1}. ${t}`).join('\n'),
      );
      if (choice) {
        const idx = parseInt(choice, 10) - 1;
        const time = idx >= 0 && idx < WAKE_HOUR_OPTIONS.length ? WAKE_HOUR_OPTIONS[idx] : choice.trim();
        savePrefs({ quiet_hours_end: time });
      }
    } else {
      Alert.alert('Quiet Hours End', 'Resume push notifications at:', [
        ...WAKE_HOUR_OPTIONS.map((t) => ({ text: t, onPress: () => savePrefs({ quiet_hours_end: t }) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [savePrefs]);

  if (isLoading) {
    return (
      <PlayerScreen label="SETTINGS" title="Notifications" onBack={() => navigation.goBack()} scroll={false}>
        <TomoLoader messages={NOTIFICATIONS_LOADER_MESSAGES} />
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen
      label="SETTINGS"
      title="Notifications"
      onBack={() => navigation.goBack()}
      contentStyle={styles.scrollContent}
    >
        {/* Push Category Toggles */}
        <Text style={styles.sectionTitle}>Push Notification Categories</Text>
        <View style={styles.card}>
          {CATEGORY_TOGGLES.map((cat, index) => (
            <React.Fragment key={cat.key}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <View style={[styles.toggleIconWrap, { backgroundColor: cat.color + '20' }]}>
                    <SmartIcon name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={styles.toggleTextCol}>
                    <Text style={styles.toggleLabel}>{cat.label}</Text>
                    <Text style={styles.toggleSubtitle}>{cat.subtitle}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'center' }}>
                  {cat.locked ? (
                    <View style={styles.lockedBadge}>
                      <SmartIcon name="lock-closed" size={10} color={colors.textDisabled} />
                      <Text style={[styles.lockedText, { color: colors.textDisabled }]}>Always on</Text>
                    </View>
                  ) : (
                    <Switch
                      value={prefs[cat.key] as boolean}
                      onValueChange={(val) => savePrefs({ [cat.key]: val })}
                      trackColor={{ false: colors.border, true: cat.color }}
                      thumbColor={colors.textPrimary}
                    />
                  )}
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Quiet Hours */}
        <Text style={styles.sectionTitle}>Quiet Hours</Text>
        <View style={styles.card}>
          <Pressable style={styles.settingRow} onPress={handleQuietHoursStart}>
            <View style={styles.settingInfo}>
              <SmartIcon name="moon-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.settingLabel}>No push after</Text>
            </View>
            <View style={styles.timeBadge}>
              <Text style={[styles.timeValue, { color: colors.accent }]}>{prefs.quiet_hours_start}</Text>
              <SmartIcon name="chevron-forward" size={14} color={colors.textDisabled} />
            </View>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.settingRow} onPress={handleQuietHoursEnd}>
            <View style={styles.settingInfo}>
              <SmartIcon name="sunny-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.settingLabel}>Resume at</Text>
            </View>
            <View style={styles.timeBadge}>
              <Text style={[styles.timeValue, { color: colors.accent }]}>{prefs.quiet_hours_end}</Text>
              <SmartIcon name="chevron-forward" size={14} color={colors.textDisabled} />
            </View>
          </Pressable>
          <Text style={styles.quietNote}>
            Critical alerts (load warnings, injury risk) bypass quiet hours.
          </Text>
        </View>

        {/* Daily Push Cap */}
        <Text style={styles.sectionTitle}>Daily Push Limit</Text>
        <View style={styles.card}>
          <View style={styles.capRow}>
            <Text style={styles.settingLabel}>Max pushes per day</Text>
            <View style={styles.capControls}>
              <Pressable
                style={styles.capBtn}
                onPress={() => savePrefs({ max_push_per_day: Math.max(1, prefs.max_push_per_day - 1) })}
              >
                <SmartIcon name="remove" size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.capValue, { color: colors.accent }]}>{prefs.max_push_per_day}</Text>
              <Pressable
                style={styles.capBtn}
                onPress={() => savePrefs({ max_push_per_day: Math.min(10, prefs.max_push_per_day + 1) })}
              >
                <SmartIcon name="add" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.footnote}>
          In-app notifications always appear regardless of push settings.
        </Text>
    </PlayerScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      marginTop: spacing.xl,
      marginLeft: spacing.xs,
    },

    card: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.lg,
    },

    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.compact,
    },
    toggleInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md },
    toggleIconWrap: {
      width: 34, height: 34, borderRadius: 17,
      justifyContent: 'center', alignItems: 'center', marginRight: spacing.compact,
    },
    toggleTextCol: { flex: 1 },
    toggleLabel: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
    toggleSubtitle: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textSecondary, marginTop: 1 },

    lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    lockedText: { fontSize: 9, fontFamily: fontFamily.regular },

    settingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.compact,
    },
    settingInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    settingLabel: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },

    timeBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.creamSubtle,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.compact, paddingVertical: spacing.xs, gap: spacing.xs,
    },
    timeValue: { fontFamily: fontFamily.medium, fontSize: 14 },

    quietNote: {
      fontFamily: fontFamily.regular, fontSize: 10, color: colors.textDisabled,
      paddingVertical: spacing.sm, paddingLeft: spacing.xs,
    },

    capRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.compact,
    },
    capControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    capBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.creamMuted,
      justifyContent: 'center', alignItems: 'center',
    },
    capValue: { fontFamily: fontFamily.bold, fontSize: 18, minWidth: 24, textAlign: 'center' },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    footnote: {
      fontFamily: fontFamily.regular, fontSize: 10, color: colors.textDisabled,
      textAlign: 'center', marginTop: spacing.lg,
    },
  });
}
