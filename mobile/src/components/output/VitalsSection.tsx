/**
 * VitalsSection — Gen Z redesign with ReadinessHero + 7 VitalGroupCards.
 * Groups wearable data into meaningful clusters with RAG status indicators.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import type { OutputSnapshot, VitalGroup, VitalMetric } from '../../services/api';
import { getRagColor, getRagBgColor, getTrendIcon, getTrendColor, getGroupThemeColor } from './outputTypes';

interface Props {
  vitals: OutputSnapshot['vitals'];
}

// Map readiness score to ReadinessRing-compatible level
const READINESS_MAP: Record<string, { score: number; color: string; glow: string; label: string }> = {
  Green: { score: 85, color: '#30D158', glow: 'rgba(48, 209, 88, 0.25)', label: 'Ready' },
  Yellow: { score: 55, color: '#F39C12', glow: 'rgba(243, 156, 18, 0.25)', label: 'Caution' },
  Red: { score: 25, color: '#E74C3C', glow: 'rgba(231, 76, 60, 0.25)', label: 'Rest' },
};

export function VitalsSection({ vitals }: Props) {
  const { colors } = useTheme();
  const { vitalGroups, phv, readiness } = vitals;

  const readinessInfo = readiness.score ? READINESS_MAP[readiness.score] : null;
  const hasVitalData = vitalGroups && vitalGroups.some((g) => g.metrics.length > 0);

  return (
    <View style={styles.container}>
      {/* ── Readiness Hero Card ─────────────────────────────────── */}
      <GlowWrapper glow={readinessInfo ? 'subtle' : 'none'}>
        <GlassCard>
          <View style={styles.heroCenter}>
            {/* Large circular readiness indicator */}
            <View style={[styles.readinessCircle, {
              borderColor: readinessInfo?.color || colors.glassBorder,
              shadowColor: readinessInfo?.glow || 'transparent',
            }]}>
              <Text style={[styles.readinessScore, { color: readinessInfo?.color || colors.textMuted }]}>
                {readinessInfo?.score ?? '—'}
              </Text>
              <Text style={[styles.readinessLabel, { color: readinessInfo?.color || colors.textMuted }]}>
                {readinessInfo?.label ?? 'No Data'}
              </Text>
            </View>

            <Text style={[styles.heroTitle, { color: colors.textOnDark }]}>
              {readiness.score ? 'Today\'s Readiness' : 'How Are You Feeling?'}
            </Text>
            <Text style={[styles.heroSummary, { color: colors.textMuted }]}>
              {readiness.summary}
            </Text>

            {/* Mini stats row */}
            {readiness.energy != null && (
              <View style={styles.miniStatsRow}>
                <MiniStat icon="flash" label="Energy" value={readiness.energy} max={5} colors={colors} />
                <MiniStat icon="happy" label="Mood" value={readiness.mood ?? 0} max={5} colors={colors} />
                <MiniStat icon="moon" label="Sleep" value={readiness.sleepHours ?? 0} max={10} suffix="h" colors={colors} />
                {readiness.soreness != null && (
                  <MiniStat icon="fitness" label="Soreness" value={readiness.soreness} max={5} colors={colors} />
                )}
              </View>
            )}
          </View>
        </GlassCard>
      </GlowWrapper>

      {/* ── Vital Group Cards ───────────────────────────────────── */}
      {hasVitalData && vitalGroups.map((group, index) => (
        group.metrics.length > 0 && (
          <VitalGroupCard
            key={group.groupId}
            group={group}
            phv={group.groupId === 'body_growth' ? phv : null}
            colors={colors}
            index={index}
          />
        )
      ))}

      {/* ── Empty State ─────────────────────────────────────────── */}
      {!hasVitalData && (
        <GlassCard>
          <View style={styles.emptyState}>
            <Ionicons name="watch-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Vitals Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Connect a wearable in Settings to start tracking your body data.
            </Text>
          </View>
        </GlassCard>
      )}
    </View>
  );
}

// ── Mini Stat Chip ──────────────────────────────────────────────────────

function MiniStat({ icon, label, value, max, suffix, colors }: {
  icon: string; label: string; value: number; max: number; suffix?: string; colors: any;
}) {
  return (
    <View style={[styles.miniStat, { backgroundColor: colors.glass }]}>
      <Ionicons name={icon as any} size={14} color={colors.accent1} />
      <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniValue, { color: colors.textOnDark }]}>
        {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
        {suffix || `/${max}`}
      </Text>
    </View>
  );
}

// ── Vital Group Card ────────────────────────────────────────────────────

function VitalGroupCard({ group, phv, colors, index }: {
  group: VitalGroup;
  phv: OutputSnapshot['vitals']['phv'] | null;
  colors: any;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const themeColor = getGroupThemeColor(group.colorTheme);
  const ragColor = getRagColor(group.ragStatus);
  const ragBg = getRagBgColor(group.ragStatus);

  // Pick top 2 metrics for collapsed preview
  const previewMetrics = group.metrics.slice(0, 2);

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header */}
        <View style={styles.groupHeader}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.textOnDark }]}>
              {group.displayName}
            </Text>
          </View>
          {/* RAG dot */}
          {group.ragStatus !== 'none' && (
            <View style={[styles.ragDot, { backgroundColor: ragColor }]} />
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </View>

        {/* Collapsed: preview metrics inline */}
        {!expanded && previewMetrics.length > 0 && (
          <View style={styles.previewRow}>
            {previewMetrics.map((m) => (
              <View key={m.metric} style={[styles.previewChip, { backgroundColor: themeColor + '15' }]}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{m.label}</Text>
                <Text style={[styles.previewValue, { color: themeColor }]}>
                  {m.avg != null ? (Number.isInteger(m.avg) ? m.avg : m.avg.toFixed(1)) : '—'}{m.unit !== 'steps' ? m.unit : ''}
                </Text>
                <Text style={[styles.previewTrend, { color: getTrendColor(m.trend) }]}>
                  {getTrendIcon(m.trend)}{m.trendPercent ? `${Math.abs(m.trendPercent)}%` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Expanded: full metric list + description */}
        {expanded && (
          <View style={styles.expandedContent}>
            <Text style={[styles.groupDescription, { color: colors.textMuted }]}>
              {group.athleteDescription}
            </Text>

            {group.metrics.map((m) => (
              <MetricRow key={m.metric} metric={m} themeColor={themeColor} colors={colors} />
            ))}

            {/* PHV/LTAD info inside Body & Growth */}
            {phv && (
              <View style={[styles.phvBanner, { backgroundColor: '#FF6B35' + '15', borderColor: '#FF6B35' + '33' }]}>
                <Text style={styles.phvEmoji}>{phv.ltad.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phvTitle, { color: colors.textOnDark }]}>
                    {phv.ltad.stageName}
                    <Text style={[styles.phvOffset, { color: '#FF6B35' }]}>
                      {' '}PHV {phv.maturityOffset > 0 ? '+' : ''}{phv.maturityOffset.toFixed(1)}
                    </Text>
                  </Text>
                  <Text style={[styles.phvDesc, { color: colors.textMuted }]}>
                    {phv.ltad.description}
                  </Text>
                  {/* Progress bar */}
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, {
                      width: `${phv.ltad.progressPercent}%`,
                      backgroundColor: '#FF6B35',
                    }]} />
                  </View>
                  <View style={styles.focusTags}>
                    {phv.ltad.trainingFocus.map((f, i) => (
                      <View key={i} style={[styles.focusTag, { backgroundColor: colors.border }]}>
                        <Text style={[styles.focusTagText, { color: colors.textOnDark }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

// ── Individual Metric Row ───────────────────────────────────────────────

function MetricRow({ metric, themeColor, colors }: {
  metric: VitalMetric; themeColor: string; colors: any;
}) {
  const trendColor = getTrendColor(metric.trend);
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricEmoji}>{metric.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.metricLabel, { color: colors.textOnDark }]}>{metric.label}</Text>
        <Text style={[styles.metricSummary, { color: colors.textMuted }]} numberOfLines={2}>
          {metric.summary}
        </Text>
      </View>
      <View style={styles.metricValueCol}>
        <Text style={[styles.metricValue, { color: themeColor }]}>
          {metric.avg != null ? (Number.isInteger(metric.avg) ? metric.avg : metric.avg.toFixed(1)) : '—'}
          <Text style={styles.metricUnit}>{metric.unit !== 'steps' ? metric.unit : ''}</Text>
        </Text>
        <View style={styles.metricTrendRow}>
          <Text style={[styles.metricTrend, { color: trendColor }]}>
            {getTrendIcon(metric.trend)}
            {metric.trendPercent ? ` ${Math.abs(metric.trendPercent)}%` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  // Hero
  heroCenter: { alignItems: 'center', gap: spacing.sm },
  readinessCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  readinessScore: { fontFamily: fontFamily.bold, fontSize: 36 },
  readinessLabel: { fontFamily: fontFamily.medium, fontSize: 13, marginTop: -4 },
  heroTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  heroSummary: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  // Mini stats
  miniStatsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  miniStat: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.compact,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  miniLabel: { fontFamily: fontFamily.regular, fontSize: 10 },
  miniValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },

  // Group card
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupEmoji: { fontSize: 20 },
  groupName: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  ragDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },

  // Preview (collapsed)
  previewRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
  },
  previewLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
  previewValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  previewTrend: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Expanded
  expandedContent: { marginTop: spacing.sm, gap: spacing.sm },
  groupDescription: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginBottom: 4 },

  // Metric row
  metricRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  metricEmoji: { fontSize: 16, marginTop: 2 },
  metricLabel: { fontFamily: fontFamily.medium, fontSize: 13 },
  metricSummary: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },
  metricValueCol: { alignItems: 'flex-end' },
  metricValue: { fontFamily: fontFamily.bold, fontSize: 16 },
  metricUnit: { fontFamily: fontFamily.regular, fontSize: 11 },
  metricTrendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  metricTrend: { fontFamily: fontFamily.medium, fontSize: 11 },

  // PHV Banner
  phvBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: spacing.compact,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  phvEmoji: { fontSize: 24, marginTop: 2 },
  phvTitle: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  phvOffset: { fontFamily: fontFamily.medium, fontSize: 12 },
  phvDesc: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 4 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  focusTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  focusTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  focusTagText: { fontFamily: fontFamily.regular, fontSize: 10 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.huge, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg },
});
