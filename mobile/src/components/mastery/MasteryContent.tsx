/**
 * MasteryContent — Main body for the Mastery/Progress screen.
 *
 * Sections:
 * 1. DNACard Hero — radar + overall rating + tier
 * 2. 7 MasteryPillarCards (always present, sorted by priority)
 * 3. Strengths & Growth Areas chips
 * 4. Empty state overlay when no test data
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { DNACard, type CardAttribute } from '../DNACard';
import { GlassCard } from '../GlassCard';
import { Badge } from '../Badge';
import { GradientButton } from '../GradientButton';
import { MasteryPillarCard } from './MasteryPillarCard';
import { PillarCard, TomoButton } from '../tomo-ui';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance } from '../../hooks/useAnimations';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius, layout } from '../../theme/spacing';
import { pillarColors } from '../../theme/colors';
import type { MasterySnapshot, MasteryPillar } from '../../services/api';

// ── Helpers ──────────────────────────────────────────────────────────

/** Map radar profile → DNACard CardAttribute array */
function radarToAttributes(
  radarProfile: MasterySnapshot['radarProfile'],
): CardAttribute[] {
  return radarProfile.map((axis) => ({
    label: axis.label,
    abbreviation: axis.key.charAt(0).toUpperCase() + axis.key.slice(1),
    value: axis.value,
    maxValue: axis.maxValue,
    color: axis.color,
    key: axis.key,
  }));
}

/** Map sport string to DNACard's accepted sport type */
function mapSport(sport: string): 'football' | 'padel' {
  if (sport === 'padel') return 'padel';
  return 'football'; // default for all other sports
}

// ── Pillar icon + subtitle mapping (Coach in Your Pocket) ────────────

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

/** Map pillar groupId to a colors key */
function getPillarColorKey(groupId: string): string {
  const lower = groupId.toLowerCase();
  for (const key of Object.keys(pillarColors)) {
    if (lower.includes(key)) return key;
  }
  return 'endurance'; // fallback
}

// ── Animated Pillar Wrapper ──────────────────────────────────────────

function AnimatedPillar({
  pillar,
  index,
}: {
  pillar: MasteryPillar;
  index: number;
}) {
  const animatedStyle = useSpringEntrance(index, 200);
  return (
    <Animated.View style={animatedStyle}>
      <MasteryPillarCard pillar={pillar} />
    </Animated.View>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  data: MasterySnapshot;
  /** Navigate to My Metrics (Output tab) to record tests */
  onRecordTests?: () => void;
  onAttributeTap?: (key: string) => void;
}

export function MasteryContent({
  data,
  onRecordTests,
  onAttributeTap,
}: Props) {
  const { colors } = useTheme();

  // Listen for draft radar color overrides from CMS preview (web only)
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

  // Apply draft color overrides to radar profile
  const radarWithOverrides = data.radarProfile.map((axis) => ({
    ...axis,
    color: draftRadarColors[axis.key] || axis.color,
  }));

  const attributes = radarToAttributes(radarWithOverrides);
  const benchmarkAttributes = data.benchmarkRadarProfile
    ? radarToAttributes(data.benchmarkRadarProfile)
    : undefined;

  return (
    <View style={styles.container}>
      {/* ── Section 1: DNACard Hero ── */}
      <View style={styles.section}>
        {data.hasTestData ? (
          <DNACard
            attributes={attributes}
            benchmarkAttributes={benchmarkAttributes}
            overallRating={data.overallRating}
            position={data.player.position}
            cardTier={data.cardTier}
            sport={mapSport(data.player.sport)}
            onAttributeTap={onAttributeTap}
          />
        ) : (
          <View style={styles.cardOverlayWrap}>
            <DNACard
              attributes={attributes}
              overallRating={0}
              position={data.player.position}
              cardTier="bronze"
              sport={mapSport(data.player.sport)}
            />
            {/* Frosted overlay */}
            <View
              style={[
                styles.frostedOverlay,
                { backgroundColor: 'rgba(13, 12, 14, 0.75)' },
              ]}
            >
              <Text
                style={[styles.overlayText, { color: colors.textOnDark }]}
              >
                Complete your first test{'\n'}to unlock your card
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
      </View>

      {/* ── Section 2: 7 Mastery Pillar Cards (Coach in Your Pocket) ── */}
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
            />
          );
        })}
      </View>

      {/* Strengths & Growth Areas removed — shown in Own It page */}

      {/* ── Section 4: Empty State CTA (no test data) ── */}
      {!data.hasTestData && (
        <View style={styles.section}>
          <GlassCard>
            <Text
              style={[styles.emptyTitle, { color: colors.textOnDark }]}
            >
              Unlock Your Athletic Profile
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Record your test results in My Metrics to see how you
              compare to athletes your age. Your mastery pillars will light
              up as you add more data.
            </Text>

            {/* Show age-band targets */}
            <View style={styles.targetsList}>
              {data.pillars
                .filter((p) => p.metrics.length > 0)
                .slice(0, 4)
                .map((p) => {
                  const topMetric = p.metrics[0];
                  return (
                    <View key={p.groupId} style={styles.targetRow}>
                      <Text
                        style={[
                          styles.targetEmoji,
                        ]}
                      >
                        {p.emoji}
                      </Text>
                      <Text
                        style={[
                          styles.targetLabel,
                          { color: colors.textOnDark },
                        ]}
                        numberOfLines={1}
                      >
                        {topMetric.metricLabel}
                      </Text>
                      <Text
                        style={[
                          styles.targetValue,
                          { color: colors.accent2 },
                        ]}
                      >
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
    paddingHorizontal: layout.screenMargin,
  },
  section: {
    marginBottom: spacing.xl,
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
  // DNACard overlay
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
  // Strengths & Growth
  chipColumns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  chipColumn: {
    flex: 1,
  },
  chipColumnLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.compact,
  },
});
