/**
 * Whoop Data Screen
 *
 * Full visibility into all WHOOP data synced to Tomo.
 * Shows connection status, last sync timestamp, and all data organized
 * by category: Recovery, Sleep, Workouts, Daily Summary.
 *
 * Accessible via Profile > Whoop Data menu item.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SmartIcon } from '../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  fontFamily,
  borderRadius,
  layout,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import {
  getWhoopData,
  syncWhoop,
} from '../services/api';
import type {
  WhoopDataResponse,
  WhoopDataCategory,
  WhoopMetricValue,
} from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'WhoopData'>;
};

// ── Helpers ──

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMetricValue(value: number, unit: string): string {
  if (unit === 'time') {
    // Minutes-since-midnight → "9:30 AM"
    const hours = Math.floor(value / 60);
    const mins = Math.round(value % 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${mins.toString().padStart(2, '0')} ${period}`;
  }
  if (unit === '%') return `${Math.round(value * 10) / 10}%`;
  if (unit === 'ms') return `${Math.round(value * 10) / 10} ms`;
  if (unit === 'bpm') return `${Math.round(value)} bpm`;
  if (unit === 'hrs') return `${(Math.round(value * 10) / 10).toFixed(1)} hrs`;
  if (unit === 'min') return `${Math.round(value)} min`;
  if (unit === 'breaths/min') return `${Math.round(value * 10) / 10} br/min`;
  if (unit === 'kcal') return `${Math.round(value)} kcal`;
  if (unit === '\u00B0C') return `${(Math.round(value * 10) / 10).toFixed(1)}\u00B0C`;
  if (!unit || unit === '') return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value * 10) / 10} ${unit}`;
}

// Category config
const CATEGORIES = [
  { key: 'recovery' as const, title: 'Recovery', icon: 'heart-outline' as const, defaultExpanded: true },
  { key: 'sleep' as const, title: 'Sleep', icon: 'moon-outline' as const, defaultExpanded: true },
  { key: 'workout' as const, title: 'Workouts', icon: 'barbell-outline' as const, defaultExpanded: false },
  { key: 'cycle' as const, title: 'Daily Summary', icon: 'pulse-outline' as const, defaultExpanded: false },
] as const;

// ── Section Component ──

function CategorySection({
  title,
  icon,
  data,
  labels,
  defaultExpanded,
  colors,
  index,
}: {
  title: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  data: WhoopDataCategory[];
  labels: Record<string, string>;
  defaultExpanded: boolean;
  colors: ThemeColors;
  index: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggleExpanded = useCallback(() => {
    Haptics.selectionAsync();
    setExpanded(prev => !prev);
  }, []);

  const isEmpty = data.length === 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(300)}
      style={styles.sectionContainer}
    >
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: colors.creamSubtle }]}>
            <SmartIcon name={icon} size={18} color={colors.accent1} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!isEmpty && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{data.length}d</Text>
            </View>
          )}
        </View>
        <SmartIcon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textInactive}
        />
      </Pressable>

      {expanded && (
        <View style={styles.sectionContent}>
          {isEmpty ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No {title.toLowerCase()} data synced yet</Text>
            </View>
          ) : (
            data.map((day, dayIdx) => (
              <View key={day.date} style={[styles.dayCard, dayIdx > 0 && styles.dayCardGap]}>
                <Text style={styles.dayLabel}>{formatDate(day.date)}</Text>
                <View style={styles.metricsGrid}>
                  {Object.entries(day.metrics).map(([key, metric]) => (
                    <View key={key} style={styles.metricRow}>
                      <Text style={styles.metricLabel} numberOfLines={1}>
                        {metric.label || labels[key] || key}
                      </Text>
                      <Text style={styles.metricValue}>
                        {formatMetricValue(metric.value, metric.unit)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ── Main Screen ──

export function WhoopDataScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<WhoopDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = await getWhoopData(7);
      setData(result);
    } catch (e: any) {
      console.warn('[WhoopDataScreen] Failed to load data:', e?.message);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await syncWhoop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Reload data after sync
      await loadData();
    } catch (e: any) {
      console.warn('[WhoopDataScreen] Sync failed:', e?.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Auto-sync on page load if connected and data is stale (>15 min)
  const autoSyncTriggered = React.useRef(false);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    if (!data || autoSyncTriggered.current || !data.connected) return;
    const hoursSince = data.hours_since_sync;
    // Auto-sync if last sync >15 min ago (or never synced)
    if (hoursSince === null || hoursSince > 0.25) {
      autoSyncTriggered.current = true;
      handleSync();
    }
  }, [data, handleSync]);

  if (loading) {
    return (
      <PlayerScreen
        label="INTEGRATIONS"
        title="Whoop"
        onBack={() => navigation.goBack()}
        scroll={false}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent1} />
        </View>
      </PlayerScreen>
    );
  }

  const isConnected = data?.connected ?? false;
  const lastSyncText = formatTimeAgo(data?.last_sync_at ?? null);
  const totalPoints = data?.total_data_points ?? 0;

  return (
    <PlayerScreen
      label="INTEGRATIONS"
      title="Whoop"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent1}
          />
        }
      >
        {/* Connection Status Banner */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.statusBanner}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isConnected && data?.data_fresh ? colors.readinessGreen : isConnected ? colors.warning : colors.textInactive }
              ]} />
              <View>
                <Text style={styles.statusTitle}>
                  {isConnected ? 'WHOOP Connected' : 'WHOOP Not Connected'}
                </Text>
                {isConnected && (
                  <Text style={styles.statusSub}>
                    Last synced: {lastSyncText} {'\u00B7'} {totalPoints} data points
                  </Text>
                )}
                {!isConnected && (
                  <Text style={styles.statusSub}>
                    Connect in Settings to start syncing
                  </Text>
                )}
              </View>
            </View>
          </View>

          {isConnected && (
            <Pressable
              onPress={handleSync}
              disabled={syncing}
              style={({ pressed }) => [
                styles.syncButton,
                pressed && { opacity: 0.7 },
                syncing && { opacity: 0.5 },
              ]}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.accent1} />
              ) : (
                <SmartIcon name="sync-outline" size={16} color={colors.accent1} />
              )}
              <Text style={styles.syncButtonText}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Text>
            </Pressable>
          )}

          {!isConnected && (
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              style={({ pressed }) => [styles.syncButton, pressed && { opacity: 0.7 }]}
            >
              <SmartIcon name="link-outline" size={16} color={colors.accent1} />
              <Text style={styles.syncButtonText}>Go to Settings</Text>
            </Pressable>
          )}

          {data?.sync_error && (
            <View style={styles.errorBanner}>
              <SmartIcon name="warning-outline" size={14} color={colors.warning} />
              <Text style={styles.errorText}>{data.sync_error}</Text>
            </View>
          )}
        </Animated.View>

        {/* Data Categories */}
        {isConnected && data && CATEGORIES.map((cat, idx) => (
          <CategorySection
            key={cat.key}
            title={cat.title}
            icon={cat.icon}
            data={data.categories[cat.key]}
            labels={data.metric_labels}
            defaultExpanded={cat.defaultExpanded}
            colors={colors}
            index={idx + 1}
          />
        ))}

        {/* Not connected empty state */}
        {!isConnected && (
          <Animated.View entering={FadeInDown.delay(150).duration(300)} style={styles.emptyFullState}>
            <SmartIcon name="watch-outline" size={48} color={colors.textInactive} />
            <Text style={styles.emptyFullTitle}>No WHOOP Data</Text>
            <Text style={styles.emptyFullSub}>
              Connect your WHOOP band in Settings to start syncing recovery, sleep, strain, and heart rate data.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </PlayerScreen>
  );
}

// ── Styles ──

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.backgroundElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    headerSpacer: { width: 36 },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.xl,
    },

    // ── Status Banner ──
    statusBanner: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    statusSub: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    syncButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.accent1,
    },
    syncButtonText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
      backgroundColor: `${colors.warning}15`,
    },
    errorText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.warning,
      flex: 1,
    },

    // ── Category Sections ──
    sectionContainer: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    sectionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sectionIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: colors.creamSubtle,
    },
    countText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textMuted,
    },
    sectionContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },

    // ── Day Cards ──
    dayCard: {
      backgroundColor: colors.background,
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    dayCardGap: {
      marginTop: spacing.sm,
    },
    dayLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
      marginBottom: spacing.sm,
    },
    metricsGrid: {
      gap: spacing.xs,
    },
    metricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 3,
    },
    metricLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      flex: 1,
    },
    metricValue: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textOnDark,
      textAlign: 'right',
    },

    // ── Empty States ──
    emptyState: {
      paddingVertical: spacing.lg,
      alignItems: 'center',
    },
    emptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
    },
    emptyFullState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl * 2,
      gap: spacing.md,
    },
    emptyFullTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    emptyFullSub: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 280,
    },
  });
}
