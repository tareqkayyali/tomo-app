/**
 * Settings Screen — Wearables, Edit Profile link, Notifications, Privacy, Logout
 *
 * Separate from Edit Profile. This is the hub for all app settings.
 * Accessible via the Settings capsule on every screen header.
 *
 * WHOOP: Uses real OAuth flow via backend authorize endpoint.
 * Apple Watch: Uses HealthKit (existing local integration).
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartIcon } from '../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { updateUser, getIntegrationStatus, disconnectWhoop, syncWhoop, getWhoopAuthorizeUrl } from '../services/api';
import type { IntegrationStatus } from '../services/api';
import type { ConnectedWearables } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

// ── Types ──────────────────────────────────────────────────────────

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Settings'>;
};

// ── Wearable definitions ──────────────────────────────────────────

const WEARABLE_DEFS = [
  {
    key: 'whoop' as const,
    name: 'WHOOP',
    icon: 'fitness-outline',
    iconBg: colors.backgroundElevated,
    emoji: '',
    desc: 'Heart rate, HRV, sleep, recovery score',
    connectedDesc: 'Syncing HR, HRV, Sleep, Recovery',
    oauth: true, // Uses OAuth flow
  },
  {
    key: 'appleWatch' as const,
    name: 'Apple Watch',
    icon: 'watch-outline',
    iconBg: colors.surface,
    desc: 'Steps, heart rate, workouts, sleep via HealthKit',
    connectedDesc: 'Syncing HealthKit data',
    oauth: false, // Local HealthKit
  },
];

// ── Helper: format relative time ──────────────────────────────────

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ──────────────────────────────────────────────────────

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Local wearable state (Apple Watch — HealthKit toggle)
  const [wearables, setWearables] = useState<ConnectedWearables>(
    profile?.connectedWearables || {},
  );
  const [saving, setSaving] = useState(false);

  // WHOOP integration state (from backend)
  const [whoopStatus, setWhoopStatus] = useState<IntegrationStatus | null>(null);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── Load integration status on mount ────────────────────────────

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const { integrations } = await getIntegrationStatus();
      const whoop = integrations.find((i) => i.provider === 'whoop');
      if (whoop) setWhoopStatus(whoop);
    } catch (e) {
      console.warn('[Settings] Failed to load integration status:', e);
    }
  }, []);

  useEffect(() => {
    loadIntegrationStatus();
  }, [loadIntegrationStatus]);

  // Listen for deep link return from WHOOP OAuth
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (event.url.includes('whoop=connected')) {
        loadIntegrationStatus();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [loadIntegrationStatus]);

  // ── WHOOP OAuth connect ─────────────────────────────────────────

  const connectWhoop = useCallback(async () => {
    setWhoopLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Fetch the WHOOP OAuth URL from backend (authenticated API call)
      const whoopOAuthUrl = await getWhoopAuthorizeUrl();

      if (Platform.OS === 'web') {
        // On web, redirect the browser to WHOOP's OAuth page
        window.location.href = whoopOAuthUrl;
      } else {
        // On native, open in system browser
        const result = await WebBrowser.openAuthSessionAsync(
          whoopOAuthUrl,
          'tomo://settings',
          { showInRecents: true }
        );

        if (result.type === 'success' && result.url) {
          if (result.url.includes('whoop=connected')) {
            await loadIntegrationStatus();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Could not connect to WHOOP. Please try again.');
      } else {
        Alert.alert('Error', 'Could not connect to WHOOP. Please try again.');
      }
      console.error('[Settings] WHOOP connect error:', e);
    } finally {
      setWhoopLoading(false);
    }
  }, [loadIntegrationStatus]);

  // ── WHOOP disconnect ────────────────────────────────────────────

  const handleDisconnectWhoop = useCallback(async () => {
    const doDisconnect = async () => {
      setWhoopLoading(true);
      try {
        await disconnectWhoop();
        setWhoopStatus(null);
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Could not disconnect WHOOP.');
        } else {
          Alert.alert('Error', 'Could not disconnect WHOOP.');
        }
      } finally {
        setWhoopLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Disconnect WHOOP? This will stop syncing your WHOOP data. You can reconnect anytime.')) {
        doDisconnect();
      }
    } else {
      Alert.alert(
        'Disconnect WHOOP',
        'This will stop syncing your WHOOP data. You can reconnect anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disconnect', style: 'destructive', onPress: doDisconnect },
        ],
      );
    }
  }, []);

  // ── WHOOP manual sync ───────────────────────────────────────────

  const handleSyncWhoop = useCallback(async () => {
    setSyncing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await syncWhoop();
      console.log('[Settings] WHOOP sync result:', JSON.stringify(result));
      await loadIntegrationStatus();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('[Settings] WHOOP sync error:', e);
      if (Platform.OS === 'web') {
        window.alert('Could not sync WHOOP data. Please try again.');
      } else {
        Alert.alert('Sync Failed', 'Could not sync WHOOP data. Please try again.');
      }
    } finally {
      setSyncing(false);
    }
  }, [loadIntegrationStatus]);

  // ── Apple Watch toggle (existing HealthKit flow) ────────────────

  const toggleAppleWatch = useCallback(async () => {
    const current = wearables.appleWatch;
    const updated: ConnectedWearables = {
      ...wearables,
      appleWatch: current?.connected
        ? { connected: false }
        : { connected: true, connectedAt: new Date().toISOString() },
    };

    setWearables(updated);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setSaving(true);
    try {
      await updateUser({ connectedWearables: updated } as Parameters<typeof updateUser>[0]);
      await refreshProfile();
    } catch {
      setWearables(wearables);
      if (Platform.OS === 'web') {
        window.alert('Could not update wearable status.');
      } else {
        Alert.alert('Error', 'Could not update wearable status.');
      }
    } finally {
      setSaving(false);
    }
  }, [wearables, refreshProfile]);

  // ── Wearable press handler ──────────────────────────────────────

  const handleWearablePress = useCallback(
    (key: string) => {
      if (key === 'whoop') {
        if (whoopStatus?.connected) {
          // Connected — use the explicit Disconnect button instead
          return;
        } else {
          connectWhoop();
        }
      } else if (key === 'appleWatch') {
        toggleAppleWatch();
      }
    },
    [whoopStatus, connectWhoop, handleDisconnectWhoop, toggleAppleWatch],
  );

  // ── Render ────────────────────────────────────────────────────────

  const isWhoopConnected = whoopStatus?.connected ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => {
          if (Platform.OS === 'web' && window.history.length > 1) {
            window.history.back();
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            (navigation as any).navigate('MainTabs');
          }
        }} hitSlop={12} style={styles.backBtn}>
          <SmartIcon name="chevron-back" size={24} color={colors.textOnDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
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

          {WEARABLE_DEFS.map((w) => {
            const isConnected =
              w.key === 'whoop' ? isWhoopConnected : wearables[w.key]?.connected;
            const isLoading =
              w.key === 'whoop' ? whoopLoading : saving;

            return (
              <View key={w.key}>
                <Pressable
                  style={({ pressed }) => [
                    styles.wearableCard,
                    {
                      backgroundColor: isConnected
                        ? colors.accent1 + '08'
                        : colors.backgroundElevated,
                      borderColor: isConnected ? colors.accent + '50' : colors.glassBorder,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleWearablePress(w.key)}
                  disabled={isLoading}
                >
                  <View style={[styles.wearableIcon, { backgroundColor: w.iconBg }]}>
                    {w.emoji ? (
                      <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                    ) : (
                      <SmartIcon name={w.icon as any} size={22} color="#F5F3ED" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wearableName, { color: colors.textOnDark }]}>
                      {w.name}
                    </Text>
                    <Text style={[styles.wearableDesc, { color: colors.textInactive }]}>
                      {isConnected ? `Connected · ${w.connectedDesc}` : w.desc}
                    </Text>
                    {/* Show last sync time for WHOOP */}
                    {w.key === 'whoop' && isConnected && whoopStatus?.last_sync_at && (
                      <Text style={[styles.syncTime, { color: colors.textMuted }]}>
                        Last synced: {formatTimeAgo(whoopStatus.last_sync_at)}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isConnected ? colors.accent + '18' : colors.accent1 + '12',
                      },
                    ]}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.accent1} />
                    ) : isConnected ? (
                      <>
                        <SmartIcon name="checkmark-circle" size={16} color={colors.accent} />
                        <Text style={[styles.statusText, { color: colors.accent }]}>Connected</Text>
                      </>
                    ) : (
                      <>
                        <SmartIcon name="link-outline" size={16} color={colors.accent1} />
                        <Text style={[styles.statusText, { color: colors.accent1 }]}>Connect</Text>
                      </>
                    )}
                  </View>
                </Pressable>

                {/* Sync + Disconnect buttons for connected WHOOP */}
                {w.key === 'whoop' && isConnected && (
                  <View style={styles.whoopActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.syncButton,
                        { backgroundColor: colors.backgroundElevated, flex: 1 },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={handleSyncWhoop}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <ActivityIndicator size="small" color={colors.accent2} />
                      ) : (
                        <SmartIcon name="sync-outline" size={16} color={colors.accent2} />
                      )}
                      <Text style={[styles.syncButtonText, { color: colors.accent2 }]}>
                        {syncing ? 'Syncing...' : 'Sync Now'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.syncButton,
                        { backgroundColor: colors.error + '12', borderColor: colors.error + '30', borderWidth: 1 },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={handleDisconnectWhoop}
                      disabled={whoopLoading}
                    >
                      <SmartIcon name="unlink-outline" size={16} color={colors.error} />
                      <Text style={[styles.syncButtonText, { color: colors.error }]}>
                        Disconnect
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={[styles.footnote, { color: colors.textInactive }]}>
            More wearables coming soon (Garmin, Oura, Fitbit)
          </Text>

          {/* Go to Output button */}
          <Pressable
            onPress={() => navigation.navigate('Main' as any, {
              screen: 'MainTabs',
              params: { screen: 'Test', params: { initialTab: 'vitals' } },
            })}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
                marginTop: 16,
                backgroundColor: colors.accentMuted,
                borderColor: colors.accentBorder,
                borderWidth: 1,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <SmartIcon name="analytics-outline" size={16} color={colors.accent2} />
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 13, color: colors.accent2 }}>
              Go to Output
            </Text>
          </Pressable>
        </View>

        {/* ── Body & Growth Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Body & Growth</Text>
          <Text style={[styles.sectionHint, { color: colors.textInactive }]}>
            Track your physical development
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.wearableCard,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.glassBorder,
              },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => navigation.navigate('PHVCalculator')}
          >
            <View style={[styles.wearableIcon, { backgroundColor: colors.secondarySubtle }]}>
              <SmartIcon name="resize-outline" size={22} color={colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.wearableName, { color: colors.textOnDark }]}>
                Growth Stage (PHV)
              </Text>
              <Text style={[styles.wearableDesc, { color: colors.textInactive }]}>
                Calculate your maturity offset & training stage
              </Text>
            </View>
            <SmartIcon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
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
    syncTime: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 2,
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
    whoopActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: -4,
      marginBottom: spacing.sm,
      justifyContent: 'flex-end',
    },
    syncButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: borderRadius.md,
    },
    syncButtonText: {
      fontFamily: fontFamily.medium,
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
