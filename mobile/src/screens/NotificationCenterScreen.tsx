/**
 * NotificationCenterScreen — Rich, actionable notification center.
 *
 * Replaces the flat NotificationsScreen with:
 * - CategoryFilterBar (horizontal scroll, sticky)
 * - SectionList: "Right Now" (P1), "Today" (24h), "This Week" (7d), "Earlier"
 * - NotificationCard (4 priority variants)
 * - Pull-to-refresh, empty states per category
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { spacing, borderRadius, fontFamily, layout } from '../theme';
import { apiRequest } from '../services/api';
import { TomoLoader, NOTIFICATIONS_LOADER_MESSAGES } from '../components/TomoLoader';
import { type NotificationData } from '../components/notifications/NotificationCard';
import { SwipeableNotificationCard } from '../components/notifications/SwipeableNotificationCard';
import { CategoryFilterBar } from '../components/notifications/CategoryFilterBar';
import { type CategoryFilter } from '../components/notifications/constants';

interface Section {
  title: string;
  data: NotificationData[];
  collapsed?: boolean;
}

// ─── Empty States ─────────────────────────────────────────────────────

const EMPTY_STATES: Record<CategoryFilter, { icon: keyof typeof Ionicons.glyphMap; message: string }> = {
  all: { icon: 'checkmark-circle-outline', message: "You're all caught up" },
  critical: { icon: 'shield-checkmark-outline', message: 'No critical alerts' },
  training: { icon: 'barbell-outline', message: 'No training notifications' },
  coaching: { icon: 'star-outline', message: 'No new coaching insights' },
  academic: { icon: 'book-outline', message: 'No academic alerts' },
  triangle: { icon: 'diamond-outline', message: 'No Triangle updates' },
  cv: { icon: 'document-outline', message: 'No CV activity' },
};

// ─── Section Logic ────────────────────────────────────────────────────

function getSectionKey(n: NotificationData, now: number): string {
  if (n.priority === 1 && n.status === 'unread') return 'RIGHT_NOW';
  const ageMs = now - new Date(n.created_at).getTime();
  if (ageMs < 24 * 60 * 60 * 1000) return 'TODAY';
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return 'THIS_WEEK';
  return 'EARLIER';
}

const SECTION_ORDER = ['RIGHT_NOW', 'TODAY', 'THIS_WEEK', 'EARLIER', 'DONE'];
const SECTION_TITLES: Record<string, string> = {
  RIGHT_NOW: 'Right Now',
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  EARLIER: 'Earlier',
  DONE: 'Done',
};

// ─── API Functions ────────────────────────────────────────────────────

async function fetchCenterNotifications(options: {
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  notifications: NotificationData[];
  unread_count: number;
  by_category: Record<string, number>;
  by_category_total?: Record<string, number>;
}> {
  const params = new URLSearchParams({ source: 'center' });
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  return apiRequest(`/api/v1/notifications?${params.toString()}`);
}

async function markCenterRead(id: string): Promise<void> {
  await apiRequest(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
}

async function markCenterActed(id: string): Promise<void> {
  await apiRequest(`/api/v1/notifications/${id}/act`, { method: 'PATCH' });
}

async function dismissCenterNotif(id: string): Promise<void> {
  await apiRequest(`/api/v1/notifications/${id}/dismiss`, { method: 'PATCH' });
}

async function markAllCenterRead(category?: string): Promise<void> {
  await apiRequest('/api/v1/notifications/read-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'center', category }),
  });
}

// ─── Screen ───────────────────────────────────────────────────────────

export function NotificationCenterScreen() {
  const { colors } = useTheme();
  const { refresh: refreshBell } = useNotifications();
  const navigation = useNavigation();

  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (category?: CategoryFilter, append = false) => {
    try {
      setFetchError(null);
      const offset = append ? notifications.length : 0;
      const result = await fetchCenterNotifications({
        category: category ?? selectedCategory,
        limit: PAGE_SIZE,
        offset,
      });
      if (append) {
        setNotifications((prev) => [...prev, ...result.notifications]);
      } else {
        setNotifications(result.notifications);
      }
      setByCat(result.by_category_total ?? result.by_category ?? {});
      setUnreadCount(result.unread_count);
      setHasMore(result.notifications.length >= PAGE_SIZE);
    } catch (err) {
      console.error('[notification-center] Fetch failed:', err);
      if (!append) setFetchError('Could not load notifications. Pull to retry.');
    }
  }, [selectedCategory, notifications.length]);

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    fetchData().finally(() => setLoading(false));
  }, [selectedCategory]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchData(undefined, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleCategorySelect = useCallback((cat: CategoryFilter) => {
    setSelectedCategory(cat);
  }, []);

  const handlePrimaryAction = useCallback(async (n: NotificationData) => {
    if (n.primary_action?.deep_link) {
      // Has navigation — mark as read (not acted) and navigate.
      // The notification resolves when the actual action is completed
      // (e.g., check-in done → event pipeline resolves CHECKIN_REMINDER).
      if (n.status === 'unread') {
        await markCenterRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'read' as const } : x)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      try {
        await Linking.openURL(n.primary_action.deep_link);
      } catch {
        // Fallback: silent
      }
    } else {
      // No navigation (e.g., "I understand", "Understood") — mark as acted immediately
      await markCenterActed(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'acted' as const } : x)));
      setUnreadCount((prev) => (n.status === 'unread' ? Math.max(0, prev - 1) : prev));
    }
  }, []);

  const handleSecondaryAction = useCallback(async (n: NotificationData) => {
    if (n.secondary_action?.resolves) {
      await markCenterActed(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'acted' as const } : x)));
    } else if (n.secondary_action?.dismisses) {
      await dismissCenterNotif(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'dismissed' as const } : x)));
    }
    setUnreadCount((prev) => (n.status === 'unread' ? Math.max(0, prev - 1) : prev));

    if (n.secondary_action?.deep_link) {
      try {
        await Linking.openURL(n.secondary_action.deep_link);
      } catch {}
    }
  }, []);

  const handleDismiss = useCallback(async (n: NotificationData) => {
    await dismissCenterNotif(n.id);
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'dismissed' as const } : x)));
    setUnreadCount((prev) => (n.status === 'unread' ? Math.max(0, prev - 1) : prev));
  }, []);

  const handlePress = useCallback(async (n: NotificationData) => {
    if (n.status === 'unread') {
      await markCenterRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'read' as const } : x)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const cat = selectedCategory !== 'all' ? selectedCategory : undefined;
    await markAllCenterRead(cat);
    await Promise.all([fetchData(), refreshBell()]);
  }, [selectedCategory, fetchData, refreshBell]);

  // Build sections — acted/dismissed notifications move to "Done" at bottom
  const sections = useMemo(() => {
    const now = Date.now();
    const visible = notifications.filter((n) => n.status !== 'expired');
    const grouped: Record<string, NotificationData[]> = {};

    for (const n of visible) {
      const isDone = n.status === 'acted' || n.status === 'dismissed';
      const key = isDone ? 'DONE' : getSectionKey(n, now);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(n);
    }

    // Sort within each section: latest first
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return SECTION_ORDER
      .filter((key) => grouped[key] && grouped[key].length > 0)
      .map((key) => ({
        title: SECTION_TITLES[key],
        data: grouped[key],
        count: grouped[key].length,
      }));
  }, [notifications]);

  const isEmpty = sections.length === 0 && !loading;
  const emptyState = EMPTY_STATES[selectedCategory];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <SmartIcon name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: colors.error }]}>
            <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={[styles.markAllText, { color: colors.accent }]}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {/* Category Filter */}
      <CategoryFilterBar
        selected={selectedCategory}
        counts={byCat}
        onSelect={handleCategorySelect}
      />

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <TomoLoader messages={NOTIFICATIONS_LOADER_MESSAGES} />
        </View>
      )}

      {/* Error State */}
      {fetchError && !loading && (
        <View style={styles.emptyContainer}>
          <SmartIcon name="cloud-offline-outline" size={48} color={colors.error} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{fetchError}</Text>
        </View>
      )}

      {/* Empty State */}
      {isEmpty && !fetchError && (
        <View style={styles.emptyContainer}>
          <SmartIcon name={emptyState.icon} size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {emptyState.message}
          </Text>
        </View>
      )}

      {/* Section List */}
      {!loading && !isEmpty && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {section.title}
              </Text>
              <Text style={[styles.sectionCount, { color: colors.textDisabled }]}>
                {section.data.length}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            <SwipeableNotificationCard
              notification={item}
              index={index}
              onPrimaryAction={handlePrimaryAction}
              onSecondaryAction={handleSecondaryAction}
              onDismiss={handleDismiss}
              onPress={handlePress}
              onMarkRead={handlePress}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <View>
              {loadingMore && (
                <ActivityIndicator size="small" color={colors.accent} style={{ paddingVertical: spacing.md }} />
              )}
              <Pressable
                style={styles.settingsLink}
                onPress={() => (navigation as any).navigate('NotificationSettings')}
              >
                <SmartIcon name="settings-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.settingsText, { color: colors.textSecondary }]}>
                  Notification preferences
                </Text>
                <SmartIcon name="chevron-forward" size={14} color={colors.textDisabled} />
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.compact,
    gap: spacing.sm,
  },
  backBtn: {
    marginRight: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
  },
  headerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamily.bold,
  },
  markAllText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
  },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  settingsText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
});
