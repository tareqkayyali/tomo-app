/**
 * Settings Screen — Wearables, Edit Profile link, Notifications, Privacy, Logout
 *
 * Separate from Edit Profile. This is the hub for all app settings.
 * Accessible via the Settings capsule on every screen header.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { updateUser } from '../services/api';
import type { ConnectedWearables } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

// ── Types ──────────────────────────────────────────────────────────

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Settings'>;
};

// ── Wearable definitions ──────────────────────────────────────────

const WEARABLES: {
  key: 'whoop' | 'appleWatch';
  name: string;
  icon: string;
  iconBg: string;
  emoji?: string;
  desc: string;
  connectedDesc: string;
}[] = [
  {
    key: 'whoop',
    name: 'WHOOP',
    icon: 'fitness-outline',
    iconBg: '#1A1A2E',
    emoji: '🟡',
    desc: 'Heart rate, HRV, sleep, recovery score',
    connectedDesc: 'Syncing HR, HRV, Sleep, Recovery',
  },
  {
    key: 'appleWatch',
    name: 'Apple Watch',
    icon: 'watch-outline',
    iconBg: '#333',
    desc: 'Steps, heart rate, workouts, sleep via HealthKit',
    connectedDesc: 'Syncing HealthKit data',
  },
];

// ── Component ──────────────────────────────────────────────────────

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [wearables, setWearables] = useState<ConnectedWearables>(
    profile?.connectedWearables || {},
  );
  const [saving, setSaving] = useState(false);

  // ── Toggle wearable ─────────────────────────────────────────────

  const toggleWearable = useCallback(async (key: 'whoop' | 'appleWatch') => {
    const current = wearables[key];
    const updated: ConnectedWearables = {
      ...wearables,
      [key]: current?.connected
        ? { connected: false }
        : { connected: true, connectedAt: new Date().toISOString() },
    };

    setWearables(updated);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Persist immediately
    setSaving(true);
    try {
      await updateUser({ connectedWearables: updated } as Parameters<typeof updateUser>[0]);
      await refreshProfile();
    } catch {
      // Revert on failure
      setWearables(wearables);
      Alert.alert('Error', 'Could not update wearable status.');
    } finally {
      setSaving(false);
    }
  }, [wearables, refreshProfile]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textOnDark} />
        </Pressable>
        <Text style={styles.headerTitle}>My Vitals</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Wearables Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wearables</Text>
          <Text style={[styles.sectionHint, { color: colors.textInactive }]}>
            Connect your device to sync vitals automatically
          </Text>

          {WEARABLES.map((w) => {
            const isConnected = wearables[w.key]?.connected;
            return (
              <Pressable
                key={w.key}
                style={({ pressed }) => [
                  styles.wearableCard,
                  {
                    backgroundColor: isConnected
                      ? colors.accent1 + '08'
                      : colors.backgroundElevated,
                    borderColor: isConnected ? '#30D158' + '50' : colors.glassBorder,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => toggleWearable(w.key)}
                disabled={saving}
              >
                <View style={[styles.wearableIcon, { backgroundColor: w.iconBg }]}>
                  {w.emoji ? (
                    <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                  ) : (
                    <Ionicons name={w.icon as any} size={22} color="#FFF" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wearableName, { color: colors.textOnDark }]}>
                    {w.name}
                  </Text>
                  <Text style={[styles.wearableDesc, { color: colors.textInactive }]}>
                    {isConnected ? `Connected · ${w.connectedDesc}` : w.desc}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isConnected ? '#30D158' + '18' : colors.accent1 + '12',
                    },
                  ]}
                >
                  {isConnected ? (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#30D158" />
                      <Text style={[styles.statusText, { color: '#30D158' }]}>Connected</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="link-outline" size={16} color={colors.accent1} />
                      <Text style={[styles.statusText, { color: colors.accent1 }]}>Connect</Text>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}

          <Text style={[styles.footnote, { color: colors.textInactive }]}>
            More wearables coming soon (Garmin, Oura, Fitbit)
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.xl,
    },

    // Sections
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginBottom: spacing.xs,
    },
    sectionHint: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginBottom: spacing.md,
    },

    // Wearable cards
    wearableCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    wearableIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wearableName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      letterSpacing: 0.3,
    },
    wearableDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    statusText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
    },
    footnote: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      textAlign: 'center',
      marginTop: spacing.xs,
    },

  });
}
