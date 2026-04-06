/**
 * MasteryContent — Main body for the Mastery/Progress screen.
 *
 * Dashboard layout:
 * 1. RadarDashboardCard — standalone radar with rating + position + tier
 * 2. MetricGrid — 2x2 (TIS, Rating, Streak, Consistency)
 * 3. 7 MasteryPillarCards (tappable → AI chat)
 * 4. Progress trajectories (line charts per test type)
 * 5. Achievements (next milestone + earned badges)
 * 6. Empty state CTA when no test data
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, FlatList } from 'react-native';
import Animated from 'react-native-reanimated';
import { GlassCard } from '../GlassCard';
import { GradientButton } from '../GradientButton';
import { MasteryPillarCard } from './MasteryPillarCard';
import { PillarCard, TomoButton } from '../tomo-ui';
import { RadarDashboardCard } from './RadarDashboardCard';
import { MetricGrid } from './MetricGrid';
import { AskTomoChip } from './AskTomoChip';
import { TrajectoryCard } from './TrajectoryCard';
import { NextMilestoneCard } from './NextMilestoneCard';
import { AchievementCard } from './AchievementCard';
import { ProgressTabs } from './ProgressTabs';
import type { RadarAttribute } from '../HexagonRadar';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance } from '../../hooks/useAnimations';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius, layout } from '../../theme/spacing';
import { pillarColors } from '../../theme/colors';
import { colors } from '../../theme/colors';

import type {
  MasterySnapshot,
  MasteryPillar,
  MomentumResponse,
  TrajectoryResponse,
  AchievementsResponse,
} from '../../services/api';

// ── Helpers ──────────────────────────────────────────────────────────

/** Map radar profile → HexagonRadar RadarAttribute array */
function radarToRadarAttributes(
  radarProfile: MasterySnapshot['radarProfile'],
): RadarAttribute[] {
  return radarProfile.map((axis) => ({
    key: axis.key,
    label: axis.label,
    value: axis.value,
    maxValue: axis.maxValue,
    color: axis.color,
  }));
}

// ── Pillar icon + subtitle mapping ────────────────────────────────────

const PILLAR_ICON_MAP: Record<string, string> = {
  endurance: 'endurance',
  strength: 'strength',
  power: 'power',
  speed: 'speed',
  agility: 'agility',
  flexibility: 'flexibility',
  mental: 'mental',
};

const PILLAR_SUBTITLE_MAP: Record<string, string> = {
  endurance: 'Keep your engine running',
  strength: 'Build your foundation',
  power: 'Explosive when it counts',
  speed: 'Leave them in the dust',
  agility: 'Quick feet, sharp turns',
  flexibility: 'Move freely, recover fast',
  mental: 'Stay locked in',
};

function getPillarColorKey(groupId: string): string {
  const lower = groupId.toLowerCase();
  for (const key of Object.keys(pillarColors)) {
    if (lower.includes(key)) return key;
  }
  return 'endurance';
}

// ── Progress tab config ──────────────────────────────────────────────

const PROGRESS_TABS = [
  { key: 'trends', label: 'Trends' },
  { key: 'history', label: 'History' },
];

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  data: MasterySnapshot;
  tisScore: number | null;
  momentum: MomentumResponse | null;
  trajectoryData: TrajectoryResponse | null;
  achievements: AchievementsResponse | null;
  onRecordTests?: () => void;
  onAttributeTap?: (key: string) => void;
  onAskTomo: (prompt: string) => void;
}

export function MasteryContent({
  data,
  tisScore,
  momentum,
  trajectoryData,
  achievements,
  onRecordTests,
  onAttributeTap,
  onAskTomo,
}: Props) {
  const { colors } = useTheme();
  const [progressTab, setProgressTab] = useState('trends');

  // CMS draft radar color overrides (web only)
  const [draftRadarColors, setDraftRadarColors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (msg?.type === 'TOMO_DRAFT_RADAR_COLORS' && msg.payload) {
        setDraftRadarColors(msg.payload as Record<string, string>);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const radarWithOverrides = data.radarProfile.map((axis) => ({
    ...axis,
    color: draftRadarColors[axis.key] || axis.color,
  }));

  const radarAttributes = radarToRadarAttributes(radarWithOverrides);
  const benchmarkRadarAttributes = data.benchmarkRadarProfile
    ? radarToRadarAttributes(data.benchmarkRadarProfile)
    : undefined;

  // Get trajectory entries sorted by total tests (most tested first)
  const trajectoryEntries = trajectoryData
    ? Object.values(trajectoryData.trajectories).sort((a, b) => b.totalTests - a.totalTests)
    : [];

  // Build benchmarks lookup from pillar metrics for trajectory charts
  const getBenchmarksForTest = useCallback((testType: string) => {
    for (const pillar of data.pillars) {
      for (const metric of pillar.metrics) {
        if (metric.metricKey === testType) {
          return { p25: metric.norm.p25, p50: metric.norm.p50, p75: metric.norm.p75 };
        }
      }
    }
    return undefined;
  }, [data.pillars]);

  return (
    <View style={styles.container}>
      {/* ── DASHBOARD ZONE: Radar ── */}
      <View style={[styles.section, { paddingHorizontal: 0 }]}>
        {data.hasTestData ? (
          <RadarDashboardCard
            attributes={radarAttributes}
            benchmarkAttributes={benchmarkRadarAttributes}
            overallRating={data.overallRating}
            position={data.player.position}
            cardTier={data.cardTier}
            onAttributeTap={onAttributeTap}
          />
        ) : (
          <View style={styles.cardOverlayWrap}>
            <RadarDashboardCard
              attributes={radarAttributes}
              overallRating={0}
              position={data.player.position}
              cardTier="bronze"
            />
            <View style={[styles.frostedOverlay, { backgroundColor: 'rgba(13, 12, 14, 0.75)' }]}>
              <Text style={[styles.overlayText, { color: colors.textOnDark }]}>
                Complete your first test{'\n'}to unlock your radar
              </Text>
              {onRecordTests && (
                <GradientButton
                  title="Record Your Tests"
                  icon="stats-chart-outline"
                  onPress={onRecordTests}
                  small
                  style={{ marginTop: spacing.md }}
                />
              )}
            </View>
          </View>
        )}

        <AskTomoChip
          label="Break down my radar shape"
          prompt="Break down my radar shape — what do my attributes mean and where's my biggest gap?"
          onPress={onAskTomo}
        />
      </View>

      {/* ── DASHBOARD ZONE: Metric Grid ── */}
      <View style={[styles.section, { paddingHorizontal: 0 }]}>
        <MetricGrid
          overallRating={data.overallRating}
          tisScore={tisScore}
          momentum={momentum}
        />
        <AskTomoChip
          label="How's my momentum?"
          prompt="How's my overall momentum this month? What's driving my score?"
          onPress={onAskTomo}
        />
      </View>

      {/* ── PILLAR ZONE: 7 Mastery Pillars ── */}
      <View style={styles.section}>
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: colors.chalk }]}>
            Your 7 Pillars
          </Text>
          <View style={[styles.sectionUnderline, { backgroundColor: colors.electricGreen }]} />
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.chalkDim }]}>
          {data.hasTestData
            ? 'Your performance vs players your age'
            : 'Complete tests to see your scores'}
        </Text>
        {data.pillars.map((pillar, i) => {
          const colorKey = getPillarColorKey(pillar.groupId);
          const pColors = pillarColors[colorKey] || pillarColors.endurance;
          const iconName = PILLAR_ICON_MAP[colorKey] || 'endurance';
          const subtitle = PILLAR_SUBTITLE_MAP[colorKey] || pillar.athleteDescription;
          const score = pillar.avgPercentile != null ? Math.round(pillar.avgPercentile) : 0;

          return (
            <PillarCard
              key={pillar.groupId}
              name={pillar.displayName}
              score={score}
              subtitle={subtitle}
              icon={iconName}
              accentColor={pColors.accent}
              accentBg={pColors.bg}
              enterIndex={i + 3}
              onPress={() =>
                onAskTomo(`Tell me about my ${pillar.displayName} and what I can do to improve`)
              }
            />
          );
        })}
        <AskTomoChip
          label="Which pillar to focus on?"
          prompt="Which of my 7 mastery pillars should I prioritize right now?"
          onPress={onAskTomo}
        />
      </View>

      {/* ── PROGRESS ZONE: Trajectories ── */}
      {trajectoryEntries.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleWrap}>
            <Text style={[styles.sectionTitle, { color: colors.chalk }]}>
              My Progress
            </Text>
            <View style={[styles.sectionUnderline, { backgroundColor: colors.electricGreen }]} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            <ProgressTabs
              tabs={PROGRESS_TABS}
              activeKey={progressTab}
              onTabPress={setProgressTab}
            />
          </View>

          {progressTab === 'trends' && (
            <View>
              {trajectoryEntries.slice(0, 5).map((traj) => (
                <TrajectoryCard
                  key={traj.testType}
                  trajectory={traj}
                  benchmarks={getBenchmarksForTest(traj.testType)}
                  onAskTomo={onAskTomo}
                />
              ))}
            </View>
          )}

          {progressTab === 'history' && (
            <View>
              {trajectoryEntries.map((traj) => (
                <View
                  key={traj.testType}
                  style={[styles.historyRow, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.historyLabel, { color: colors.textPrimary }]}>
                    {traj.testType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyScore, { color: colors.textPrimary }]}>
                      {traj.latestScore}
                    </Text>
                    {traj.improvementPct != null && traj.improvementPct !== 0 && (
                      <Text style={[
                        styles.historyDelta,
                        { color: traj.improvementPct > 0 ? colors.readinessGreen : colors.warning },
                      ]}>
                        {traj.improvementPct > 0 ? '+' : ''}{traj.improvementPct}%
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── ACHIEVEMENT ZONE ── */}
      {achievements && (achievements.milestones.length > 0 || achievements.nextMilestone) && (
        <View style={styles.section}>
          <View style={styles.sectionTitleWrap}>
            <Text style={[styles.sectionTitle, { color: colors.chalk }]}>
              Achievements
            </Text>
            <View style={[styles.sectionUnderline, { backgroundColor: colors.electricGreen }]} />
          </View>

          {/* Next milestone */}
          {achievements.nextMilestone && (
            <View style={{ marginTop: spacing.md }}>
              <NextMilestoneCard milestone={achievements.nextMilestone} />
            </View>
          )}

          {/* Earned milestones horizontal scroll */}
          {achievements.milestones.length > 0 && (
            <FlatList
              horizontal
              data={achievements.milestones}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <AchievementCard milestone={item} />}
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: spacing.md }}
              contentContainerStyle={{ paddingRight: spacing.md }}
            />
          )}

          <AskTomoChip
            label="My achievement story"
            prompt="What milestone should I target next based on my current trajectory?"
            onPress={onAskTomo}
          />
        </View>
      )}

      {/* ── Empty State CTA (no test data) ── */}
      {!data.hasTestData && (
        <View style={styles.section}>
          <GlassCard>
            <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
              Unlock Your Athletic Profile
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Record your test results in My Metrics to see how you
              compare to athletes your age. Your mastery pillars will light
              up as you add more data.
            </Text>

            <View style={styles.targetsList}>
              {data.pillars
                .filter((p) => p.metrics.length > 0)
                .slice(0, 4)
                .map((p) => {
                  const topMetric = p.metrics[0];
                  return (
                    <View key={p.groupId} style={styles.targetRow}>
                      {p.emoji ? <Text style={styles.targetEmoji}>{p.emoji}</Text> : null}
                      <Text
                        style={[styles.targetLabel, { color: colors.textOnDark }]}
                        numberOfLines={1}
                      >
                        {topMetric.metricLabel}
                      </Text>
                      <Text style={[styles.targetValue, { color: colors.accent2 }]}>
                        {Math.round(topMetric.normP50 * 100) / 100}
                        {topMetric.unit}
                      </Text>
                    </View>
                  );
                })}
            </View>

            {onRecordTests && (
              <TomoButton
                label="Record Your Tests"
                icon="add"
                onPress={onRecordTests}
              />
            )}
          </GlassCard>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0, // RadarDashboardCard handles its own margins
  },
  section: {
    marginBottom: spacing.xl,
    paddingHorizontal: layout.screenMargin,
  },
  sectionTitleWrap: {
    position: 'relative' as const,
    alignSelf: 'flex-start' as const,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: fontFamily.display,
    lineHeight: 28,
  },
  sectionUnderline: {
    height: 3,
    borderRadius: 2,
    marginTop: 2,
    transform: [{ rotate: '-0.3deg' }],
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: fontFamily.note,
    lineHeight: 18,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  // Overlay for empty radar
  cardOverlayWrap: {
    position: 'relative' as const,
  },
  frostedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  overlayText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
    lineHeight: 24,
  },
  // History list
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    borderBottomWidth: 0.5,
  },
  historyLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyScore: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  historyDelta: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  // Empty state
  emptyTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  targetsList: {
    marginBottom: spacing.lg,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.creamSubtle,
  },
  targetEmoji: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  targetLabel: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  targetValue: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
});
