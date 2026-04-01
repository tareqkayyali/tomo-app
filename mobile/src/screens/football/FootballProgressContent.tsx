/**
 * FootballProgressContent — Football progress dashboard (4 sections).
 *
 * Sections:
 * 1. DNA Card Hero (FIFA-style player card)
 * 2. This Week Summary (tests, streak, points, rank)
 * 3. Attributes Breakdown (6 rows, tappable -> inline detail with chart + benchmarks)
 * 4. Recent Tests (horizontal scroll)
 *
 * All data from DB -- no dummy/mock.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { SmartIcon } from '../../components/SmartIcon';

import { DNACard } from '../../components/DNACard';
import type { CardAttribute, CardTier } from '../../components/DNACard';
import { RecentTestsScroll } from '../../components';
import type { TestResult } from '../../components';
import { FootballAttributeDetailSheet } from './FootballAttributeDetailSheet';
import { EmptyProgressState } from '../../components/EmptyProgressState';
import { SkeletonCard } from '../../components';

import { useSpringEntrance } from '../../hooks/useAnimations';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useSportContext } from '../../hooks/useSportContext';
import { useFootballProgress } from '../../hooks/useFootballProgress';
import { getStats, getMyTestResults } from '../../services/api';
import type { MyTestResult } from '../../services/api';
import type { FootballAttribute, FootballPosition } from '../../types/football';
import { FOOTBALL_ATTRIBUTE_ORDER, FOOTBALL_ATTRIBUTE_FULL_NAMES } from '../../types/football';
import { FOOTBALL_ATTRIBUTE_COLORS } from '../../services/footballCalculations';

import { fontFamily, spacing, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';

// ---- Helpers ----

function getFootballCardTier(pathwayRating: number): CardTier {
  if (pathwayRating >= 850) return 'diamond';
  if (pathwayRating >= 500) return 'gold';
  if (pathwayRating >= 300) return 'silver';
  return 'bronze';
}

/** Format test type ID to human-readable name */
function formatTestName(testType: string): string {
  return testType
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map MyTestResult to RecentTestsScroll's TestResult format */
function mapToTestResult(r: MyTestResult): TestResult {
  const raw = r.rawData as Record<string, unknown> | null;
  const unit = (raw?.unit as string) || '';
  return {
    id: r.id,
    testName: formatTestName(r.testType),
    value: r.score != null ? String(r.score) : '--',
    unit,
    date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

// ---- Props ----

interface FootballProgressContentProps {
  navigation: any;
  streak: number;
  nextMilestone: { name: string; target: number; progress: number } | null;
  streakProgress: number;
  latestSleep: number | null;
  sleepOptimal: boolean;
  isFocused: boolean;
}

// ---- Component ----

export function FootballProgressContent({
  navigation,
  streak,
  isFocused,
}: FootballProgressContentProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { sportConfig } = useSportContext();
  const s = useMemo(() => createStyles(colors), [colors]);

  // User profile data
  const userId = profile?.uid || profile?.id || '';
  const age = (profile as any)?.age ?? 16;
  const position: FootballPosition = (profile as any)?.position || 'CM';

  // Football progress data from DB
  const {
    card,
    history,
    isLoading: progressLoading,
    hasData: hasRealData,
  } = useFootballProgress(userId, age, position);

  // Stats + recent tests from DB
  const [totalPoints, setTotalPoints] = useState(0);
  const [weekTests, setWeekTests] = useState(0);
  const [recentTests, setRecentTests] = useState<TestResult[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [statsRes, testsRes] = await Promise.allSettled([
          getStats(),
          getMyTestResults(10),
        ]);
        if (!mounted) return;
        if (statsRes.status === 'fulfilled') {
          setTotalPoints(statsRes.value.progress.totalPoints);
        }
        if (testsRes.status === 'fulfilled') {
          const mapped = testsRes.value.results.map(mapToTestResult);
          setRecentTests(mapped);
          // Count tests done this week
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const thisWeek = testsRes.value.results.filter(
            (r) => new Date(r.date) >= weekAgo,
          ).length;
          setWeekTests(thisWeek);
        }
      } catch {
        // silent
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Selected attribute for inline detail
  const [selectedAttr, setSelectedAttr] = useState<FootballAttribute | null>(null);

  const hasData = hasRealData && !!card?.attributes;

  // Map football attributes to DNACard format
  const footballAttributes: CardAttribute[] = hasData
    ? sportConfig.attributes.map((attr) => ({
        key: attr.key,
        label: attr.label,
        abbreviation: attr.fullName,
        value: (card!.attributes as any)[attr.key]?.score ?? 0,
        maxValue: 99,
        color: attr.color,
        trend: (card!.attributes as any)[attr.key]?.trend ?? 0,
      }))
    : [];

  const cardTier = hasData ? getFootballCardTier(card!.footballRating) : ('bronze' as CardTier);

  // Entrance animations
  const entrance1 = useSpringEntrance(1, 0, isFocused);
  const entrance2 = useSpringEntrance(2, 0, isFocused);
  const entrance3 = useSpringEntrance(3, 0, isFocused);

  // Loading
  if (progressLoading) {
    return (
      <>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </>
    );
  }

  // Empty
  if (!hasData) {
    return (
      <EmptyProgressState
        sport="football"
        onLogSession={() => navigation.navigate('Test' as any)}
        onTakeTest={() => navigation.navigate('Test' as any)}
      />
    );
  }

  const handleAttrTap = (attr: FootballAttribute) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectedAttr(attr === selectedAttr ? null : attr);
  };

  return (
    <>
      {/* ========== 1. DNA Card Hero ========== */}
      <DNACard
        attributes={footballAttributes}
        overallRating={card.overallRating}
        position={sportConfig.positions.find((p) => p.key === card.position)?.label ?? card.position}
        cardTier={cardTier}
        sport="football"
        pathwayRating={card.footballRating}
        pathwayLevel={card.footballLevel}
        onAttributeTap={(key) => handleAttrTap(key as FootballAttribute)}
        trigger={isFocused}
      />

      {/* ========== 2. This Week Summary ========== */}
      <Animated.View style={entrance1}>
        <View style={s.weekRow}>
          <View style={s.weekCard}>
            <Text style={s.weekEmoji}>{'\u26A1'}</Text>
            <Text style={s.weekValue}>{weekTests}</Text>
            <Text style={s.weekLabel}>Tests</Text>
          </View>
          <View style={s.weekCard}>
            <Text style={s.weekEmoji}>{'\uD83D\uDD25'}</Text>
            <Text style={s.weekValue}>{streak}</Text>
            <Text style={s.weekLabel}>Streak</Text>
          </View>
          <View style={s.weekCard}>
            <Text style={s.weekEmoji}>{'\u2B50'}</Text>
            <Text style={s.weekValue}>{totalPoints >= 1000 ? `${(totalPoints / 1000).toFixed(1)}k` : totalPoints}</Text>
            <Text style={s.weekLabel}>Points</Text>
          </View>
          <View style={s.weekCard}>
            <Text style={s.weekEmoji}>{'\uD83C\uDFC6'}</Text>
            <Text style={s.weekValue}>{card.footballLevel.split(' ')[0]}</Text>
            <Text style={s.weekLabel}>Rank</Text>
          </View>
        </View>
      </Animated.View>

      {/* ========== 3. Attributes Breakdown ========== */}
      <Animated.View style={entrance2}>
        <View style={s.sectionContainer}>
          <Text style={s.sectionTitle}>Attributes</Text>
          {FOOTBALL_ATTRIBUTE_ORDER.map((attr) => {
            const attrData = card.attributes[attr];
            const score = attrData?.score ?? 0;
            const trend = attrData?.trend ?? 0;
            const attrColor = FOOTBALL_ATTRIBUTE_COLORS[attr];
            const barColor = score >= 70 ? colors.accent : score >= 50 ? colors.warning : colors.error;
            const isSelected = selectedAttr === attr;

            return (
              <React.Fragment key={attr}>
                <Pressable
                  onPress={() => handleAttrTap(attr)}
                  style={({ pressed }) => [
                    s.attrRow,
                    pressed && { opacity: 0.7 },
                    isSelected && { backgroundColor: attrColor + '12' },
                  ]}
                >
                  <View style={[s.attrDot, { backgroundColor: attrColor }]} />
                  <Text style={s.attrName}>{FOOTBALL_ATTRIBUTE_FULL_NAMES[attr]}</Text>

                  {/* Colored bar */}
                  <View style={s.attrBarTrack}>
                    <View
                      style={[
                        s.attrBarFill,
                        { width: `${Math.min(100, score)}%` as any, backgroundColor: barColor },
                      ]}
                    />
                  </View>

                  <Text style={[s.attrScore, { color: attrColor }]}>{score}</Text>

                  {/* Trend arrow */}
                  {trend !== 0 && (
                    <SmartIcon
                      name={trend > 0 ? 'caret-up' : 'caret-down'}
                      size={12}
                      color={trend > 0 ? colors.accent : colors.warning}
                      style={{ marginLeft: 2 }}
                    />
                  )}

                  <SmartIcon
                    name={isSelected ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.textInactive}
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>

                {/* Inline detail expansion */}
                {isSelected && (
                  <FootballAttributeDetailSheet
                    attribute={attr}
                    data={attrData}
                    age={age}
                    position={position}
                    history={history ?? []}
                    onClose={() => {
                      if (Platform.OS !== 'web') {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      }
                      setSelectedAttr(null);
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
      </Animated.View>

      {/* ========== 4. Recent Tests ========== */}
      <Animated.View style={entrance3}>
        <RecentTestsScroll results={recentTests} />
      </Animated.View>
    </>
  );
}

// ---- Styles ----

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Week summary
    weekRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    weekCard: {
      flex: 1,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.md,
      paddingVertical: 12,
      alignItems: 'center',
      gap: 2,
    },
    weekEmoji: {
      fontSize: 18,
      marginBottom: 2,
    },
    weekValue: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    weekLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
    },

    // Attributes section
    sectionContainer: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
      marginBottom: spacing.sm,
    },

    attrRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: borderRadius.sm,
    },
    attrDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    attrName: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
      width: 88,
    },
    attrBarTrack: {
      flex: 1,
      height: 6,
      backgroundColor: colors.glass,
      borderRadius: 3,
      marginHorizontal: 8,
      overflow: 'hidden',
    },
    attrBarFill: {
      height: 6,
      borderRadius: 3,
    },
    attrScore: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      width: 28,
      textAlign: 'right',
    },
  });
}
