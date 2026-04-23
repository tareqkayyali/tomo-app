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
} from 'react-native';
import { TomoRefreshControl, PullRefreshOverlay } from '../components';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { Loader } from '../components/Loader';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

import { useTheme } from '../hooks/useTheme';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  respondToParentLink,
} from '../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../theme';
import type { AppNotification, NotificationType } from '../types';
import { DrillNotificationCard } from '../components/player/DrillNotificationCard';
import { colors } from '../theme/colors';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';

const ICON_MAP: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  suggestion_received: { icon: 'bulb-outline', color: colors.accent },
  suggestion_resolved: { icon: 'checkmark-circle-outline', color: colors.accent },
  relationship_accepted: { icon: 'people-outline', color: colors.info },
  relationship_declined: { icon: 'person-remove-outline', color: colors.error },
  test_result_added: { icon: 'flash-outline', color: colors.accent },
  parent_link_request: { icon: 'people-outline', color: colors.info },
  coach_link_request: { icon: 'fitness-outline', color: colors.accent },
  study_info_request: { icon: 'school-outline', color: colors.info },
  coach_drill_assigned: { icon: 'barbell-outline', color: colors.accent },
  coach_programme_published: { icon: 'megaphone-outline', color: colors.info },
};

function getNavHint(type: string, data?: Record<string, unknown>): string | null {
  switch (type) {
    case 'test_result_added': return 'View in My Metrics';
    case 'suggestion_received': {
      if (data?.type === 'program' || data?.programmeId) return 'View in My Programs';
      return 'View in Timeline';
    }
    case 'suggestion_resolved': return 'View in Timeline';
    case 'coach_programme_published': return 'View in Timeline';
    case 'relationship_accepted': return 'View Profile';
    default: return null;
  }
}

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
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Track resolved parent link requests: notifId → 'accepted' | 'declined'
  const [resolvedLinks, setResolvedLinks] = useState<Record<string, string>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getNotifications(100);
      setNotifications(res.notifications || []);
    } catch (err) {
      console.warn('[NotificationsScreen] Fetch failed:', err);
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
    // Mark as read
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
      } catch (err) {
        console.warn('[NotificationsScreen] Mark read failed:', err);
      }
    }

    // Deep navigation by notification type
    switch (notif.type) {
      case 'test_result_added':
        // Coach submitted a test → go to Dashboard
        (navigation as any).navigate('Dashboard');
        break;

      case 'suggestion_received': {
        // Coach assigned a program or study block
        const payload = notif.data as Record<string, unknown>;
        if (payload?.type === 'program' || payload?.programmeId) {
          // Program → go to Dashboard
          (navigation as any).navigate('Dashboard');
        } else {
          // Study block or other suggestion → go to Timeline
          (navigation as any).navigate('Plan');
        }
        break;
      }

      case 'suggestion_resolved':
        // Suggestion was resolved → go to Timeline to see result
        (navigation as any).navigate('Plan');
        break;

      case 'relationship_accepted':
      case 'relationship_declined':
        // Relationship update → go to Profile
        (navigation as any).navigate('Profile');
        break;

      case 'study_info_request':
        (navigation as any).navigate('Profile');
        break;

      case 'coach_programme_published':
        // Programme published → go to Timeline to see scheduled events
        (navigation as any).navigate('Plan');
        break;

      default:
        // No specific navigation for other types
        break;
    }
  }, [navigation]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.warn('[NotificationsScreen] Mark all read failed:', err);
    }
  }, []);

  const handleRespondToLink = useCallback(async (notif: AppNotification, action: 'accept' | 'decline') => {
    const relationshipId = notif.data?.relationshipId as string;
    if (!relationshipId) return;

    setRespondingId(notif.id);
    try {
      await respondToParentLink(relationshipId, action);
      setResolvedLinks((prev) => ({ ...prev, [notif.id]: action === 'accept' ? 'accepted' : 'declined' }));
      // Mark as read
      if (!notif.read) {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
      }
    } catch (err) {
      console.warn('[NotificationsScreen] Parent link response failed:', err);
    } finally {
      setRespondingId(null);
    }
  }, []);

  const hasUnread = notifications.some((n) => !n.read);

  const renderItem = ({ item }: { item: AppNotification }) => {
    // Coach drill notifications use the rich DrillNotificationCard
    if (item.type === 'coach_drill_assigned' || item.type === 'coach_programme_published') {
      return (
        <DrillNotificationCard
          notification={item as any}
          onActed={fetchData}
          colors={colors}
        />
      );
    }

    const meta = ICON_MAP[item.type] || ICON_MAP.suggestion_received;
    const isParentLink = item.type === 'parent_link_request' || item.type === 'coach_link_request';
    const resolved = resolvedLinks[item.id];
    const isResponding = respondingId === item.id;

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
          <SmartIcon name={meta.icon} size={20} color={meta.color} />
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

          {/* Parent link request: inline Accept / Decline buttons */}
          {isParentLink && !resolved && (
            <View style={styles.linkActions}>
              {isResponding ? (
                <Loader size="sm" />
              ) : (
                <>
                  <Pressable
                    onPress={() => handleRespondToLink(item, 'accept')}
                    style={[styles.linkBtn, styles.linkBtnAccept]}
                  >
                    <SmartIcon name="checkmark" size={14} color={colors.textPrimary} />
                    <Text style={styles.linkBtnText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRespondToLink(item, 'decline')}
                    style={[styles.linkBtn, styles.linkBtnDecline]}
                  >
                    <SmartIcon name="close" size={14} color={colors.textPrimary} />
                    <Text style={styles.linkBtnText}>Decline</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* Resolved badge */}
          {isParentLink && resolved && (
            <View style={[
              styles.resolvedBadge,
              { backgroundColor: resolved === 'accepted' ? colors.accentMuted : colors.secondarySubtle },
            ]}>
              <Text style={[
                styles.resolvedText,
                { color: resolved === 'accepted' ? colors.accent : colors.error },
              ]}>
                {resolved === 'accepted' ? 'Accepted' : 'Declined'}
              </Text>
            </View>
          )}

          {/* Action hint for navigable notifications */}
          {!isParentLink && getNavHint(item.type, item.data) && (
            <View style={styles.navHintRow}>
              <Text style={[styles.navHintText, { color: colors.accent1 }]}>
                {getNavHint(item.type, item.data)}
              </Text>
              <SmartIcon name="chevron-forward" size={12} color={colors.accent1} />
            </View>
          )}

          <Text style={[styles.cardTime, { color: colors.textInactive }]}>
            {timeAgo(item.created_at)}
          </Text>
        </View>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <PlayerScreen
        label="ACTIVITY"
        title="Notifications"
        onBack={() => navigation.goBack()}
        scroll={false}
      >
        <View style={styles.centered}>
          <Loader size="lg" />
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen
      label="ACTIVITY"
      title="Notifications"
      onBack={() => navigation.goBack()}
      scroll={false}
      right={
        hasUnread ? (
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={[styles.markAllText, { color: colors.accent1 }]}>Mark All Read</Text>
          </Pressable>
        ) : undefined
      }
    >
      <View style={{ flex: 1 }}>
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <TomoRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <SmartIcon name="notifications-off-outline" size={48} color={colors.textInactive} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No notifications yet
              </Text>
            </View>
          }
        />
        <PullRefreshOverlay refreshing={refreshing} />
      </View>
    </PlayerScreen>
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
  navHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  navHintText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
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

  // Parent link request actions
  linkActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.compact,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  linkBtnAccept: {
    backgroundColor: colors.accent,
  },
  linkBtnDecline: {
    backgroundColor: colors.error,
  },
  linkBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  resolvedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  resolvedText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
