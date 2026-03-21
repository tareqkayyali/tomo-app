/**
 * Coach Players Screen — Gen Z redesign
 *
 * Full-width glass card list of linked players with readiness indicators,
 * ACWR badges, streak counts, and last active time.
 *
 * Standard Tomo header pattern + QuickAccessBar.
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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { getCoachPlayers } from '../../services/api';
import { ragToColor, acwrRiskLabel } from '../../hooks/useAthleteSnapshot';
import { GlassCard } from '../../components/GlassCard';
import { QuickAccessBar } from '../../components/QuickAccessBar';
import { NotificationBell } from '../../components/NotificationBell';
import { HeaderProfileButton } from '../../components/HeaderProfileButton';
import { useAuth } from '../../hooks/useAuth';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';
import { colors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<CoachStackParamList>;

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

export function CoachPlayersScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await getCoachPlayers();
      setPlayers(res.players);
    } catch {
      // silent — empty state handles it
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPlayers();
  }, [fetchPlayers]);

  // Quick actions
  const quickActions = [
    {
      key: 'invite',
      icon: 'person-add-outline' as const,
      label: 'Invite',
      accentColor: colors.accent2,
      onPress: () => navigation.navigate('CoachInvite'),
    },
  ];

  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const renderPlayer = useCallback(
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
            navigation.navigate('CoachPlayerDetail', {
              playerId: item.id,
              playerName: item.name,
            })
          }
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <GlassCard>
            <View style={styles.playerRow}>
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: colors.accent1 + '22' }]}>
                <Text style={[styles.avatarText, { color: colors.accent1 }]}>{initials}</Text>
              </View>

              {/* Info */}
              <View style={styles.playerInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.playerName, { color: colors.textOnDark }]} numberOfLines={1}>
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
                  {item.acwr != null && (
                    <View style={[styles.acwrChip, { backgroundColor: colors.accent2 + '18' }]}>
                      <Text style={[styles.acwrText, { color: colors.accent2 }]}>
                        ACWR {item.acwr.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.streakRow}>
                    <Ionicons name="flame" size={13} color={colors.accent1} />
                    <Text style={[styles.streakText, { color: colors.textMuted }]}>
                      {item.currentStreak || 0}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Chevron */}
              <View style={styles.chevronCol}>
                <Text style={[styles.lastActive, { color: colors.textInactive }]}>
                  {formatRelativeTime(item.lastSessionAt ?? undefined)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textInactive} />
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
      {/* ── Header ──────────────────────────────────────── */}
      <View style={styles.headerArea}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            TOMO · {weekday}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>My Players</Text>
        </View>
        <View style={styles.headerRight}>
          <QuickAccessBar actions={quickActions} />
          <NotificationBell />
          <HeaderProfileButton
            initial={initial}
            photoUrl={profile?.photoUrl ?? undefined}
            onPress={() => (navigation as any).navigate('CoachProfile')}
          />
        </View>
      </View>

      {/* ── Player List / Empty State ───────────────────── */}
      {players.length === 0 ? (
        <View style={styles.emptyState}>
          <GlassCard>
            <View style={styles.emptyContent}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent1 + '15' }]}>
                <Ionicons name="people-outline" size={48} color={colors.accent1} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
                No players yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Share your invite code with players to start tracking their progress
              </Text>
              <Pressable
                onPress={() => navigation.navigate('CoachInvite')}
                style={[styles.emptyButton, { backgroundColor: colors.accent1 }]}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.emptyButtonText}>Generate Invite Code</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          renderItem={renderPlayer}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent1}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
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

  // List
  listContent: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },

  // Player card
  playerRow: {
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
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playerName: {
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
    flexWrap: 'wrap',
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
  acwrChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  acwrText: {
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

  // Empty state
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
