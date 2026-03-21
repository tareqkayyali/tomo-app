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
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance } from '../../hooks/useAnimations';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius, layout } from '../../theme/spacing';
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

      {/* ── Section 2: 7 Mastery Pillar Cards ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>
          Your Mastery Pillars
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          {data.hasTestData
            ? 'Your performance vs players your age — tap to explore'
            : 'What players your age are measured on — complete tests to see your scores'}
        </Text>
        {data.pillars.map((pillar, i) => (
          <AnimatedPillar key={pillar.groupId} pillar={pillar} index={i} />
        ))}
      </View>

      {/* ── Section 3: Strengths & Growth Areas ── */}
      {data.hasTestData &&
        (data.strengths.length > 0 || data.gaps.length > 0) && (
          <View style={styles.section}>
            <GlassCard>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textOnDark, marginBottom: spacing.md },
                ]}
              >
                Strengths & Growth Areas
              </Text>
              <View style={styles.chipColumns}>
                {/* Strengths */}
                {data.strengths.length > 0 && (
                  <View style={styles.chipColumn}>
                    <Text
                      style={[styles.chipColumnLabel, { color: colors.accent }]}
                    >
                      💪 Strengths
                    </Text>
                    <View style={styles.chipWrap}>
                      {data.strengths.map((s) => (
                        <Badge
                          key={s}
                          label={s}
                          variant="success"
                          size="small"
                        />
                      ))}
                    </View>
                  </View>
                )}
                {/* Gaps */}
                {data.gaps.length > 0 && (
                  <View style={styles.chipColumn}>
                    <Text
                      style={[styles.chipColumnLabel, { color: colors.warning }]}
                    >
                      🎯 Growth Areas
                    </Text>
                    <View style={styles.chipWrap}>
                      {data.gaps.map((g) => (
                        <Badge
                          key={g}
                          label={g}
                          variant="warning"
                          size="small"
                        />
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </GlassCard>
          </View>
        )}

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
              <GradientButton
                title="Record Your Tests"
                icon="stats-chart-outline"
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.36,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    lineHeight: 18,
    marginTop: spacing.xs,
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
