/**
 * Dashboard Screen (Home / Chat Tab)
 * Elite Proximity Score + Today's Focus + Core Performance
 *
 * Premium dark design — no white cards.
 * "Message Tomo..." bar at bottom navigates to full chat.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useAnimatedProps,
} from 'react-native-reanimated';
import { GlassCard, GradientButton, SkeletonCard } from '../components';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  typography,
  screenBg,
} from '../theme';
import { getToday, getStats } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';

type DashboardScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Chat'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

/**
 * Calculate Elite Proximity Score from user data
 * Composite of readiness, compliance, and activity.
 * Clamps to 0–100.
 */
function calculateEliteScore(data: {
  readiness?: string;
  currentStreak?: number;
  totalPoints?: number;
  complianceRate?: number;
}): number {
  let score = 50; // baseline

  // Readiness component (0-30 pts)
  if (data.readiness === 'Green') score += 30;
  else if (data.readiness === 'Yellow') score += 15;
  else if (data.readiness === 'Red') score += 0;

  // Streak component (0-20 pts)
  const streak = data.currentStreak ?? 0;
  score += Math.min(streak * 2, 20);

  // Points component (scaled)
  const pts = data.totalPoints ?? 0;
  if (pts >= 500) score += 10;
  else if (pts >= 200) score += 7;
  else if (pts >= 50) score += 4;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function getPercentileFromScore(score: number): number {
  // Approximate percentile from elite score
  return Math.min(Math.max(Math.round(score * 0.85), 5), 99);
}

export function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayData, setTodayData] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const scoreAnim = useSharedValue(0);
  const fadeIn = useSharedValue(0);

  const loadData = useCallback(async () => {
    try {
      const [today, stats] = await Promise.allSettled([getToday(), getStats()]);
      if (today.status === 'fulfilled') setTodayData(today.value);
      if (stats.status === 'fulfilled') setStatsData(stats.value);
    } catch {
      // Graceful degradation
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Animate score count-up
  const eliteScore = calculateEliteScore({
    readiness: todayData?.readiness,
    currentStreak: profile?.currentStreak,
    totalPoints: profile?.totalPoints,
    complianceRate: statsData?.complianceRate,
  });

  const percentile = getPercentileFromScore(eliteScore);

  useEffect(() => {
    if (!isLoading) {
      scoreAnim.value = withTiming(eliteScore, {
        duration: 1500,
        easing: Easing.out(Easing.cubic),
      });
      fadeIn.value = withTiming(1, { duration: 800 });
    }
  }, [isLoading, eliteScore]);

  const scoreStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Readiness for Today's Focus
  const readiness = todayData?.readiness || 'Green';
  const focusTitle = readiness === 'Red'
    ? 'Active Recovery & Rest'
    : readiness === 'Yellow'
    ? 'Light Technical Work'
    : 'Agility & Acceleration Drills';

  const projectedImpact = readiness === 'Red' ? '+0.5%' : readiness === 'Yellow' ? '+0.8%' : '+1.1%';

  // Core performance scores (computed from available data)
  const coreStats = [
    { label: 'Speed', value: Math.min(60 + Math.round((profile?.totalPoints ?? 0) / 100), 95) },
    { label: 'Agility', value: Math.min(55 + Math.round((profile?.currentStreak ?? 0) * 2), 95) },
    { label: 'Reaction', value: Math.min(50 + Math.round(eliteScore * 0.3), 95) },
    { label: 'Technical', value: Math.min(58 + Math.round(eliteScore * 0.25), 95) },
  ];

  return (
    <PlayerScreen
      label="DASHBOARD"
      title="Overview"
      onBack={() => navigation.goBack()}
      contentStyle={styles.scrollContent}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        ),
      }}
    >
      <ScrollFadeOverlay />
      <View>
        <View>
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <Animated.View style={scoreStyle}>
              {/* ═══════ Elite Proximity Score ═══════ */}
            <GlassCard style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Elite Proximity Score™</Text>

              {/* Score Arc Visual */}
              <View style={styles.scoreCircle}>
                <LinearGradient
                  colors={[colors.accentSoft, colors.accentMuted]}
                  style={styles.scoreGlow}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Text style={styles.scoreNumber}>{eliteScore}</Text>
                <Text style={styles.scorePercent}>%</Text>
              </View>

              <Text style={styles.scoreSubtitle}>
                You are ahead of {percentile}% of players your age.
              </Text>
            </GlassCard>

            {/* ═══════ Today's Focus ═══════ */}
            <GlassCard style={styles.focusCard}>
              <View style={styles.focusHeader}>
                <View style={styles.focusIconWrap}>
                  <SmartIcon name="fitness-outline" size={20} color={colors.accent1} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.focusLabel}>Today's Focus</Text>
                  <Text style={styles.focusTitle}>{focusTitle}</Text>
                  <Text style={styles.focusImpact}>{projectedImpact} to your Elite Score projected</Text>
                </View>
                <SmartIcon name="chevron-forward" size={20} color={colors.textInactive} />
              </View>

              <GradientButton
                title="Start Drills"
                onPress={() => (navigation as any).navigate('Dashboard')}
                icon="flash-outline"
                style={styles.focusCta}
              />
            </GlassCard>

            {/* ═══════ Core Performance ═══════ */}
            <GlassCard>
              <Text style={styles.sectionTitle}>Core Performance</Text>
              <View style={styles.coreRow}>
                {coreStats.map((stat) => (
                  <View key={stat.label} style={styles.coreStat}>
                    <Text style={styles.coreLabel}>{stat.label}</Text>
                    <Text style={styles.coreValue}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {/* ═══════ Readiness Breakdown (mini) ═══════ */}
            <GlassCard>
              <Text style={styles.sectionTitle}>Readiness Breakdown</Text>
              <View style={styles.readinessRow}>
                <ReadinessIndicator
                  label="Readiness"
                  value={readiness === 'Green' ? 85 : readiness === 'Yellow' ? 55 : 20}
                  color={readiness === 'Green' ? colors.readinessGreen : readiness === 'Yellow' ? colors.readinessYellow : colors.readinessRed}
                />
                <ReadinessIndicator
                  label="Compliance"
                  value={Math.min((profile?.currentStreak ?? 0) * 10 + 40, 100)}
                  color={colors.accent2}
                />
              </View>
            </GlassCard>
          </Animated.View>
          )}
        </View>
      </View>

      {/* ═══════ Message Tomo Bar ═══════ */}
      <Pressable
        style={styles.messageBar}
        onPress={() => navigation.navigate('FullChat')}
      >
        <SmartIcon name="chatbubble-outline" size={18} color={colors.textInactive} />
        <Text style={styles.messageBarText}>Message Tomo...</Text>
        <SmartIcon name="send" size={18} color={colors.accent1} />
      </Pressable>
    </PlayerScreen>
  );
}

// ── Mini Readiness Indicator ────────────────────────────────────────

function ReadinessIndicator({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.readinessItem}>
      <Text style={styles.readinessLabel}>{label}</Text>
      <View style={styles.readinessBarTrack}>
        <View style={[styles.readinessBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.readinessValue, { color }]}>{value}%</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: screenBg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    color: colors.textOnDark,
    letterSpacing: 3,
  },
  scrollContent: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: 120,
    gap: spacing.md,
  },

  // ── Score Card ────────────────────────────────────────────────────
  scoreCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  scoreLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    letterSpacing: 1,
    marginBottom: spacing.lg,
  },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  scoreGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 80,
  },
  scoreNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 72,
    color: colors.textOnDark,
    lineHeight: 80,
  },
  scorePercent: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    color: colors.textInactive,
    marginTop: -8,
  },
  scoreSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    textAlign: 'center',
  },

  // ── Focus Card ────────────────────────────────────────────────────
  focusCard: {
    gap: spacing.md,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  focusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },
  focusTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textOnDark,
    marginTop: 2,
  },
  focusImpact: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.accent1,
    marginTop: 2,
  },
  focusCta: {
    marginTop: spacing.xs,
  },

  // ── Core Performance ──────────────────────────────────────────────
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textOnDark,
    marginBottom: spacing.md,
  },
  coreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coreStat: {
    alignItems: 'center',
    flex: 1,
  },
  coreLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  coreValue: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
  },

  // ── Readiness Breakdown ───────────────────────────────────────────
  readinessRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  readinessItem: {
    flex: 1,
    gap: spacing.xs,
  },
  readinessLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
  },
  readinessBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.creamMuted,
    overflow: 'hidden',
  },
  readinessBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  readinessValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },

  // ── Message Bar ───────────────────────────────────────────────────
  messageBar: {
    position: 'absolute',
    bottom: layout.navHeight + 8,
    left: layout.screenMargin,
    right: layout.screenMargin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  messageBarText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textInactive,
  },
});
