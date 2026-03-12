/**
 * NotificationsScreen — Player notification history
 * Shows all notifications with read/unread state.
 * Tap to mark read; "Mark All Read" button in header.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../hooks/useTheme';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/api';
import { spacing, borderRadius, layout } from '../theme';
import type { AppNotification, NotificationType } from '../types';

const ICON_MAP: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  suggestion_received: { icon: 'bulb-outline', color: '#FF6B35' },
  suggestion_resolved: { icon: 'checkmark-circle-outline', color: '#2ED573' },
  relationship_accepted: { icon: 'people-outline', color: '#4A9EFF' },
  relationship_declined: { icon: 'person-remove-outline', color: '#E74C3C' },
  test_result_added: { icon: 'flash-outline', color: '#FF6B35' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await getNotifications(100);
      setNotifications(res.notifications || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleTap = useCallback(async (notif: AppNotification) => {
    if (notif.read) return;
    try {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
    } catch {
      // silent
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silent
    }
  }, []);

  const hasUnread = notifications.some((n) => !n.read);

  const renderItem = ({ item }: { item: AppNotification }) => {
    const meta = ICON_MAP[item.type] || ICON_MAP.suggestion_received;
    return (
      <Pressable
        onPress={() => handleTap(item)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: item.read ? colors.surface : colors.surfaceElevated,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: meta.color + '22' }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.cardContent}>
          <Text
            style={[
              styles.cardTitle,
              { color: colors.textOnDark, fontWeight: item.read ? '500' : '700' },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.body ? (
            <Text style={[styles.cardBody, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
          <Text style={[styles.cardTime, { color: colors.textInactive }]}>
            {timeAgo(item.created_at)}
          </Text>
        </View>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: '#FF6B35' }]} />}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Notifications</Text>
        {hasUnread && (
          <Pressable onPress={handleMarkAllRead}>
            <Text style={[styles.markAllText, { color: colors.accent1 }]}>Mark All Read</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textInactive} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No notifications yet
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    marginBottom: 2,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 2,
  },
  cardTime: {
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
