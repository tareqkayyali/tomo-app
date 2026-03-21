/**
 * Social / Leaderboard Screen
 * Tomo UI Aesthetic doc Section 8
 *
 * 3 tab pills: Team | Archetypes | Friends
 * Podium: #1 center elevated + orange glow, #2 left, #3 right
 * Ranks 4–100: rounded rect list with archetype-colored icons
 * Dark background #1A1D2E, pull-to-refresh
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlowWrapper, SkeletonCard, ErrorState, EmptyState } from '../components';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import {
  spacing,
  borderRadius,
  shadows,
  layout,
  fontFamily,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import { track } from '../services/analytics';
import {
  getTeamLeaderboard,
  getArchetypeLeaderboard,
  getStreakLeaderboard,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useSportContext } from '../hooks/useSportContext';
import { SportSwitcher } from '../components/common/SportSwitcher';
import { useFadeIn } from '../hooks/useFadeIn';
import type { LeaderboardEntry, LeaderboardResponse } from '../types';
import { colors } from '../theme/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SocialTab = 'team' | 'archetypes' | 'friends';

export interface TabConfig {
  key: SocialTab;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

export const TAB_CONFIG: TabConfig[] = [
  { key: 'team', label: 'Team' },
  { key: 'archetypes', label: 'Archetypes' },
  { key: 'friends', label: 'Friends' },
];

const ARCHETYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  phoenix: 'flame',
  titan: 'flash',
  blade: 'cut-outline',
  surge: 'water',
};

function getTabFetcher(tab: SocialTab): () => Promise<LeaderboardResponse> {
  switch (tab) {
    case 'team': return getTeamLeaderboard;
    case 'archetypes': return getArchetypeLeaderboard;
    case 'friends': return getStreakLeaderboard;
  }
}

export function getEmptyMessage(tab: SocialTab): string {
  switch (tab) {
    case 'team': return 'No team data yet. Join or create a team.';
    case 'archetypes': return 'No archetype data yet. Keep checking in.';
    case 'friends': return 'No friend data yet. Invite friends to compete.';
  }
}

export function formatLeaderboardScore(
  totalPoints: number,
  currentStreak: number,
  tab: SocialTab,
): string {
  if (tab === 'friends') return `${currentStreak}d`;
  return `${totalPoints.toLocaleString('en-US')} pts`;
}

function getAvatarColor(archetype: string | null | undefined): string {
  return getArchetypeProfile(archetype).color;
}

function getArchetypeIcon(archetype: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (!archetype) return 'person-outline';
  return ARCHETYPE_ICONS[archetype.toLowerCase()] || 'person-outline';
}

// ---------------------------------------------------------------------------
// Styles Factory
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.lg,
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 34,
      lineHeight: 41,
      color: colors.textHeader,
      letterSpacing: 0.3,
    },
    switcherWrap: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
    },

    // -- Tab Pills -----------------------------------------------------------
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: colors.accent1,
      borderColor: colors.accent1,
    },
    tabText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textInactive,
    },
    tabTextActive: {
      color: colors.textOnDark,
    },

    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.lg,
    },

    // -- Empty ---------------------------------------------------------------
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.huge,
    },
    emptyText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textInactive,
      textAlign: 'center',
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
    },

    // -- Podium --------------------------------------------------------------
    podium: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-end',
      marginBottom: spacing.xl,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    podiumSlotContainer: {
      flex: 1,
    },
    podiumSlot: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
    },
    podiumSlotFirst: {
      paddingVertical: spacing.lg,
      paddingBottom: spacing.xl,
      marginTop: -spacing.md,
      ...shadows.md,
    },
    podiumAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    podiumAvatarFirst: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 3,
      borderColor: colors.accent1,
    },
    podiumAvatarText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
    },
    podiumAvatarTextFirst: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      lineHeight: 22,
      color: colors.textOnDark,
      letterSpacing: 0.2,
    },
    podiumName: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textOnDark,
      maxWidth: 80,
      textAlign: 'center',
    },
    podiumScore: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
    },

    // -- Entry Rows (rank 4+) ------------------------------------------------
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.compact,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    entryRowHighlighted: {
      borderWidth: 1.5,
      borderColor: colors.accent1 + '60',
    },
    rankText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textInactive,
      width: 28,
      textAlign: 'center',
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    avatarText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
    },
    entryInfo: {
      flex: 1,
    },
    entryName: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textOnDark,
    },
    entryNameHighlighted: {
      color: colors.accent1,
    },
    archetypeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 1,
    },
    archetypeText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textInactive,
    },
    entryScore: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.accent1,
    },

    // ── Ghost row (new user) ──
    ghostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.compact,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.glassBorder,
      opacity: 0.7,
    },
    ghostAvatar: {
      backgroundColor: colors.glassBorder,
    },
    ghostRank: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textDisabled,
      width: 28,
      textAlign: 'center',
    },
    ghostName: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textInactive,
    },
    ghostHint: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textDisabled,
      marginTop: 1,
    },
    ghostScore: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textDisabled,
    },
  });
}

/** Hook that returns themed styles for the leaderboard screen */
function useLeaderboardStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

// ---------------------------------------------------------------------------
// Podium Component
// ---------------------------------------------------------------------------

function PodiumSlot({
  entry,
  rank,
  tab,
  isFirst,
}: {
  entry: LeaderboardEntry;
  rank: number;
  tab: SocialTab;
  isFirst?: boolean;
}) {
  const styles = useLeaderboardStyles();
  const avatarColor = getAvatarColor(entry.archetype);
  const initial = (entry.displayName || entry.name || '?').charAt(0).toUpperCase();

  const medalColors: Record<number, string> = {
    1: colors.tierGold,
    2: colors.tierSilver,
    3: colors.tierBronze,
  };

  const avatar = (
    <View style={[styles.podiumSlot, isFirst && styles.podiumSlotFirst]}>
      {/* Medal */}
      <Ionicons
        name="medal"
        size={isFirst ? 26 : 20}
        color={medalColors[rank]}
      />

      {/* Avatar circle */}
      <View
        style={[
          styles.podiumAvatar,
          isFirst && styles.podiumAvatarFirst,
          { backgroundColor: avatarColor },
        ]}
      >
        <Text style={[styles.podiumAvatarText, isFirst && styles.podiumAvatarTextFirst]}>
          {initial}
        </Text>
      </View>

      {/* Name */}
      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.displayName || entry.name}
      </Text>

      {/* Score */}
      <Text style={styles.podiumScore}>
        {formatLeaderboardScore(entry.totalPoints, entry.currentStreak, tab)}
      </Text>
    </View>
  );

  // #1 gets orange glow ring
  if (isFirst) {
    return (
      <GlowWrapper glow="ring" style={styles.podiumSlotContainer}>
        {avatar}
      </GlowWrapper>
    );
  }

  return <View style={styles.podiumSlotContainer}>{avatar}</View>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LeaderboardScreen() {
  const { colors } = useTheme();
  const styles = useLeaderboardStyles();
  const { profile } = useAuth();
  const { activeSport, setActiveSport } = useSportContext();
  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();

  const [activeTab, setActiveTab] = useState<SocialTab>('team');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const fetcher = getTabFetcher(activeTab);
      const response = await fetcher();
      setEntries(response.leaderboard || []);
    } catch {
      setError(true);
      setEntries([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    track('leaderboard_viewed', { tab: activeTab });
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const fadeIn0 = useFadeIn(0, { trigger: isFocused });
  const fadeIn1 = useFadeIn(1, { trigger: isFocused });
  const fadeIn2 = useFadeIn(2, { trigger: isFocused });

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* --- Header ---------------------------------------------------- */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
          <NotificationBell />
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* Sport Switcher — auto-hides if user has only one sport */}
      <View style={styles.switcherWrap}>
        <SportSwitcher
          activeSport={activeSport}
          onSportChange={setActiveSport}
        />
      </View>

      {/* --- Tab Pills ------------------------------------------------- */}
      <Animated.View style={[styles.tabBar, fadeIn0]}>
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [styles.tab, isActive && styles.tabActive, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* --- Content --------------------------------------------------- */}
      <View style={{ flex: 1 }}>
        <ScrollFadeOverlay />
        <FlatList
        data={rest}
        keyExtractor={(item, index) => item.userId || String(index)}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent1}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : error ? (
              <ErrorState
                message="Could not load leaderboard. Please try again."
                onRetry={loadData}
              />
            ) : entries.length === 0 ? (
              <>
                <EmptyState
                  icon="people-outline"
                  title={getEmptyMessage(activeTab)}
                  subtitle="Check in daily to climb the leaderboards."
                />
                {profile && (
                  <View style={styles.ghostRow}>
                    <Text style={styles.ghostRank}>--</Text>
                    <View style={[styles.avatar, styles.ghostAvatar]}>
                      <Ionicons name="person-outline" size={16} color={colors.textInactive} />
                    </View>
                    <View style={styles.entryInfo}>
                      <Text style={styles.ghostName} numberOfLines={1}>
                        {profile.displayName || profile.name || 'You'}
                      </Text>
                      <Text style={styles.ghostHint}>
                        Complete tests to earn your spot
                      </Text>
                    </View>
                    <Text style={styles.ghostScore}>--</Text>
                  </View>
                )}
              </>
            ) : top3.length >= 3 ? (
              <Animated.View style={[styles.podium, fadeIn1]}>
                <PodiumSlot entry={top3[1]} rank={2} tab={activeTab} />
                <PodiumSlot entry={top3[0]} rank={1} tab={activeTab} isFirst />
                <PodiumSlot entry={top3[2]} rank={3} tab={activeTab} />
              </Animated.View>
            ) : null}
          </>
        }
        renderItem={({ item: entry, index }) => {
          const rank = index + 4;
          const isCurrentUser =
            entry.userId === profile?.uid || entry.name === profile?.name;
          const avatarColor = getAvatarColor(entry.archetype);
          const archetypeIcon = getArchetypeIcon(entry.archetype);

          return (
            <View
              style={[
                styles.entryRow,
                isCurrentUser && styles.entryRowHighlighted,
              ]}
            >
              <Text style={styles.rankText}>{rank}</Text>
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>
                  {(entry.displayName || entry.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.entryInfo}>
                <Text
                  style={[
                    styles.entryName,
                    isCurrentUser && styles.entryNameHighlighted,
                  ]}
                  numberOfLines={1}
                >
                  {entry.displayName || entry.name}
                  {isCurrentUser ? ' (You)' : ''}
                </Text>
                {entry.archetype && (
                  <View style={styles.archetypeTag}>
                    <Ionicons
                      name={archetypeIcon}
                      size={12}
                      color={avatarColor}
                    />
                    <Text style={[styles.archetypeText, { color: avatarColor }]}>
                      {getArchetypeProfile(entry.archetype).name.replace('The ', '')}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.entryScore}>
                {formatLeaderboardScore(entry.totalPoints, entry.currentStreak, activeTab)}
              </Text>
            </View>
          );
        }}
        />
      </View>
    </SafeAreaView>
  );
}
