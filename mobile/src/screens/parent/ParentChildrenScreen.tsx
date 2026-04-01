/**
 * Parent Children Screen — Gen Z design
 *
 * Full-width glass card list of linked children with readiness indicators.
 * Structurally identical to CoachPlayersScreen but for parent role.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartIcon } from '../../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { getParentChildren } from '../../services/api';
import { ragToColor } from '../../hooks/useAthleteSnapshot';
import { GlassCard } from '../../components/GlassCard';
import { QuickAccessBar } from '../../components/QuickAccessBar';
import { NotificationBell } from '../../components/NotificationBell';
import { HeaderProfileButton } from '../../components/HeaderProfileButton';
import { useAuth } from '../../hooks/useAuth';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';
import { colors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<ParentStackParamList>;

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ParentChildrenScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      const res = await getParentChildren();
      setChildren(res.children);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChildren();
  }, [fetchChildren]);

  const quickActions = [
    {
      key: 'invite',
      icon: 'person-add-outline' as const,
      label: 'Invite',
      accentColor: colors.accent2,
      onPress: () => navigation.navigate('ParentInvite'),
    },
  ];

  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const renderChild = useCallback(
    ({ item }: { item: PlayerSummary }) => {
      const dotColor = ragToColor(item.readinessRag ?? undefined);
      const initials = item.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return (
        <Pressable
          onPress={() =>
            navigation.navigate('ParentChildDetail', {
              childId: item.id,
              childName: item.name,
            })
          }
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <GlassCard>
            <View style={styles.childRow}>
              <View style={[styles.avatar, { backgroundColor: colors.accent2 + '22' }]}>
                <Text style={[styles.avatarText, { color: colors.accent2 }]}>{initials}</Text>
              </View>
              <View style={styles.childInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.childName, { color: colors.textOnDark }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={[styles.readinessDot, { backgroundColor: dotColor }]} />
                </View>
                <View style={styles.metaRow}>
                  <View style={[styles.sportPill, { backgroundColor: colors.accent1 + '18' }]}>
                    <Text style={[styles.sportPillText, { color: colors.accent1 }]}>
                      {item.sport?.charAt(0).toUpperCase() + item.sport?.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.streakRow}>
                    <SmartIcon name="flame" size={13} color={colors.accent1} />
                    <Text style={[styles.streakText, { color: colors.textMuted }]}>
                      {item.currentStreak || 0}
                    </Text>
                  </View>
                  {(item as any).wellnessTrend && (
                    <View style={[styles.sportPill, { backgroundColor: colors.accent2 + '18' }]}>
                      <Text style={[styles.sportPillText, { color: colors.accent2 }]}>
                        {(item as any).wellnessTrend === 'improving' ? '↑' : (item as any).wellnessTrend === 'declining' ? '↓' : '→'} Wellness
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.chevronCol}>
                <Text style={[styles.lastActive, { color: colors.textInactive }]}>
                  {formatRelativeTime(item.lastSessionAt ?? undefined)}
                </Text>
                <SmartIcon name="chevron-forward" size={18} color={colors.textInactive} />
              </View>
            </View>
          </GlassCard>
        </Pressable>
      );
    },
    [colors, navigation],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerArea}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>TOMO · {weekday}</Text>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>My Children</Text>
        </View>
        <View style={styles.headerRight}>
          <QuickAccessBar actions={quickActions} />
          <NotificationBell />
          <HeaderProfileButton
            initial={initial}
            photoUrl={profile?.photoUrl ?? undefined}
            onPress={() => (navigation as any).navigate('ParentProfile')}
          />
        </View>
      </View>

      {children.length === 0 ? (
        <View style={styles.emptyState}>
          <GlassCard>
            <View style={styles.emptyContent}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent2 + '15' }]}>
                <SmartIcon name="people-outline" size={48} color={colors.accent2} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
                No children linked yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Ask your child to share their invite code with you, or generate one from your account
              </Text>
              <Pressable
                onPress={() => navigation.navigate('ParentInvite')}
                style={[styles.emptyButton, { backgroundColor: colors.accent2 }]}
              >
                <SmartIcon name="person-add-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.emptyButtonText}>Link Child</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      ) : (
        <FlatList
          data={children}
          keyExtractor={(item) => item.id}
          renderItem={renderChild}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerLeft: {},
  headerSubtitle: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listContent: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },
  childInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  childName: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    flex: 1,
  },
  readinessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sportPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  sportPillText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  chevronCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  lastActive: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'center',
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  emptyButtonText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
});
