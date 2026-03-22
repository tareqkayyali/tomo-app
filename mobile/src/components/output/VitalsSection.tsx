/**
 * VitalsSection — Two-block layout: "Right Now" (real-time) + "This Week" (historical).
 * Shows freshness badges, stale data banners, and pushes users to sync/check-in.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import type { OutputSnapshot, VitalGroup, VitalMetric } from '../../services/api';
import { getRagColor, getRagBgColor, getTrendIcon, getTrendColor, getGroupThemeColor } from './outputTypes';
import { colors as themeColors } from '../../theme/colors';

interface Props {
  vitals: OutputSnapshot['vitals'];
  connectedSources?: string[];
  sourcesLoading?: boolean;
  onConnectWhoop?: () => void;
  onSyncNow?: () => void;
  onCheckIn?: () => void;
}

// Map readiness score to ReadinessRing-compatible level
const READINESS_MAP: Record<string, { score: number; color: string; glow: string; label: string }> = {
  Green: { score: 85, color: themeColors.accent, glow: 'rgba(48, 209, 88, 0.25)', label: 'Ready' },
  Yellow: { score: 55, color: themeColors.warning, glow: 'rgba(243, 156, 18, 0.25)', label: 'Caution' },
  Red: { score: 25, color: themeColors.error, glow: 'rgba(231, 76, 60, 0.25)', label: 'Rest' },
};

// Freshness colors
const FRESHNESS_COLORS: Record<string, string> = {
  fresh: '#30D158',
  aging: '#F39C12',
  stale: '#E74C3C',
  no_data: '#6B6B6B',
};

export function VitalsSection({ vitals, connectedSources = [], sourcesLoading = false, onConnectWhoop, onSyncNow, onCheckIn }: Props) {
  const { colors } = useTheme();
  const { vitalGroups, phv, readiness } = vitals;
  const realTime = (vitals as any).realTime;
  const historical = (vitals as any).historical;
  const [heroExpanded, setHeroExpanded] = useState(false);

  const isExpired = (readiness as any).expired === true;
  const readinessInfo = (!isExpired && readiness.score) ? READINESS_MAP[readiness.score] : null;
  const effectiveGroups = historical?.vitalGroups ?? vitalGroups;
  const hasVitalData = effectiveGroups && effectiveGroups.some((g: VitalGroup) => g.metrics.length > 0);
  const isWhoopConnected = connectedSources.includes('whoop');

  const overallFreshness = realTime?.overallFreshness ?? 'no_data';
  const staleBanner = realTime?.staleBanner ?? null;
  const realTimeMetrics = realTime?.metrics ?? [];
  const realTimeReadiness = realTime?.readiness ?? null;

  return (
    <View style={styles.container}>
      {/* ── WHOOP Connection Banner ── */}
      {sourcesLoading ? null : isWhoopConnected ? (
        <View style={[styles.whoopBanner, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30' }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          <Text style={[styles.whoopBannerText, { color: colors.accent }]}>WHOOP Connected</Text>
          {connectedSources.filter(s => s !== 'whoop').map((src) => (
            <View key={src} style={[styles.sourcePill, { backgroundColor: colors.accent2 + '18' }]}>
              <Text style={[styles.sourcePillText, { color: colors.accent2 }]}>{src.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : onConnectWhoop ? (
        <Pressable
          style={({ pressed }) => [
            styles.whoopBanner,
            { backgroundColor: colors.accent1 + '10', borderColor: colors.accent1 + '30' },
            pressed && { opacity: 0.7 },
          ]}
          onPress={onConnectWhoop}
        >
          <Ionicons name="fitness-outline" size={18} color={colors.accent1} />
          <Text style={[styles.whoopBannerText, { color: colors.accent1 }]}>Connect WHOOP</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent1} style={{ marginLeft: 'auto' }} />
        </Pressable>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BLOCK 1: RIGHT NOW                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Right Now</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Latest readings</Text>
      </View>

      {/* Stale Data Banner */}
      {staleBanner?.show && (
        <GlassCard>
          <View style={[styles.staleBanner, { borderColor: overallFreshness === 'no_data' ? colors.textMuted + '40' : '#E74C3C40' }]}>
            <Ionicons
              name="alert-circle-outline"
              size={22}
              color={overallFreshness === 'no_data' ? colors.textMuted : '#E74C3C'}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.staleBannerText, { color: colors.textOnDark }]}>
                {staleBanner.message}
              </Text>
            </View>
          </View>
          {isWhoopConnected && onSyncNow && (
            <Pressable
              onPress={onSyncNow}
              style={[styles.syncCtaButton, { backgroundColor: 'rgba(0, 217, 255, 0.12)', borderColor: 'rgba(0, 217, 255, 0.3)', borderWidth: 1 }]}
            >
              <Ionicons name="sync-outline" size={16} color="#00D9FF" />
              <Text style={[styles.syncCtaText, { color: '#00D9FF' }]}>Sync Now</Text>
            </Pressable>
          )}
        </GlassCard>
      )}

      {/* Readiness Hero Card */}
      <GlowWrapper glow={readinessInfo ? 'subtle' : 'none'}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setHeroExpanded(!heroExpanded)}>
          <GlassCard>
            <View style={styles.heroCenter}>
              {/* Freshness badge on readiness */}
              {realTimeReadiness && (
                <FreshnessBadge
                  freshness={realTimeReadiness.freshness}
                  timeAgo={realTimeReadiness.timeAgo}
                />
              )}

              {/* Large circular readiness indicator */}
              <View style={[styles.readinessCircle, {
                borderColor: readinessInfo?.color || colors.glassBorder,
                shadowColor: readinessInfo?.glow || 'transparent',
                opacity: overallFreshness === 'stale' ? 0.5 : 1,
              }]}>
                <Text style={[styles.readinessScore, { color: readinessInfo?.color || colors.textMuted }]}>
                  {readinessInfo?.score ?? '—'}
                </Text>
                <Text style={[styles.readinessLabel, { color: readinessInfo?.color || colors.textMuted }]}>
                  {readinessInfo?.label ?? 'No Data'}
                </Text>
              </View>

              <Text style={[styles.heroTitle, { color: colors.textOnDark }]}>
                {isExpired ? 'Check In for Today' : readiness.score ? 'Today\'s Readiness' : 'How Are You Feeling?'}
              </Text>
              <Text style={[styles.heroSummary, { color: colors.textMuted }]}>
                {readiness.summary}
              </Text>

              {/* Check-in CTA when expired */}
              {isExpired && onCheckIn && (
                <TouchableOpacity
                  style={[styles.checkinCta, { backgroundColor: colors.accent1 }]}
                  onPress={onCheckIn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={16} color="#FFF" />
                  <Text style={styles.checkinCtaText}>Check In Now</Text>
                </TouchableOpacity>
              )}

              {/* Mini stats row */}
              {!isExpired && heroExpanded && readiness.energy != null && (
                <View style={styles.miniStatsRow}>
                  <MiniStat icon="flash" label="Energy" value={readiness.energy} max={5} colors={colors} />
                  <MiniStat icon="happy" label="Mood" value={readiness.mood ?? 0} max={5} colors={colors} />
                  <MiniStat icon="moon" label="Sleep" value={readiness.sleepHours ?? 0} max={10} suffix="h" colors={colors} />
                  {readiness.soreness != null && (
                    <MiniStat icon="fitness" label="Soreness" value={readiness.soreness} max={5} colors={colors} />
                  )}
                </View>
              )}

              {!isExpired && !heroExpanded && readiness.energy != null && (
                <View style={styles.tapHint}>
                  <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  <Text style={[styles.tapHintText, { color: colors.textMuted }]}>Tap for details</Text>
                </View>
              )}
            </View>
          </GlassCard>
        </TouchableOpacity>
      </GlowWrapper>

      {/* Real-Time Metric Cards (HRV, Resting HR, Sleep) */}
      {realTimeMetrics.length > 0 && (
        <View style={styles.realTimeRow}>
          {realTimeMetrics.map((m: any) => (
            <RealTimeCard key={m.metric} metric={m} colors={colors} />
          ))}
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BLOCK 2: THIS WEEK                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>This Week</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>7-day trends</Text>
      </View>

      {hasVitalData && effectiveGroups.map((group: VitalGroup, index: number) => (
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

      {/* Empty State */}
      {!hasVitalData && !staleBanner?.show && (
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

// ── Freshness Badge ─────────────────────────────────────────────────────

function FreshnessBadge({ freshness, timeAgo }: { freshness: string; timeAgo: string }) {
  const color = FRESHNESS_COLORS[freshness] || FRESHNESS_COLORS.no_data;
  return (
    <View style={styles.freshnessBadge}>
      <View style={[styles.freshnessDot, { backgroundColor: color }]} />
      <Text style={[styles.freshnessText, { color }]}>
        {freshness === 'no_data' ? 'No data' : timeAgo}
      </Text>
    </View>
  );
}

// ── Real-Time Metric Card ───────────────────────────────────────────────

function RealTimeCard({ metric, colors }: { metric: any; colors: any }) {
  const isStale = metric.freshness === 'stale' || metric.freshness === 'no_data';
  const freshnessColor = FRESHNESS_COLORS[metric.freshness] || FRESHNESS_COLORS.no_data;

  return (
    <View style={[styles.realTimeCard, { backgroundColor: colors.glass, opacity: isStale ? 0.5 : 1 }]}>
      <View style={styles.realTimeCardHeader}>
        <Text style={styles.realTimeEmoji}>{metric.emoji}</Text>
        <View style={[styles.freshnessDotSmall, { backgroundColor: freshnessColor }]} />
      </View>
      <Text style={[styles.realTimeValue, { color: colors.textOnDark }]}>
        {metric.value != null ? (Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(1)) : '—'}
        <Text style={[styles.realTimeUnit, { color: colors.textMuted }]}>{metric.unit}</Text>
      </Text>
      <Text style={[styles.realTimeLabel, { color: colors.textMuted }]}>{metric.label}</Text>
      <Text style={[styles.realTimeTimeAgo, { color: freshnessColor }]}>
        {metric.freshness === 'no_data' ? 'No data' : metric.timeAgo}
      </Text>
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
          {group.ragStatus !== 'none' && (
            <View style={[styles.ragDot, { backgroundColor: ragColor }]} />
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </View>

        {/* Collapsed: preview metrics */}
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
              <View style={[styles.phvBanner, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '33' }]}>
                <Text style={styles.phvEmoji}>{phv.ltad.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phvTitle, { color: colors.textOnDark }]}>
                    {phv.ltad.stageName}
                    <Text style={[styles.phvOffset, { color: colors.accent }]}>
                      {' '}PHV {phv.maturityOffset > 0 ? '+' : ''}{phv.maturityOffset.toFixed(1)}
                    </Text>
                  </Text>
                  <Text style={[styles.phvDesc, { color: colors.textMuted }]}>
                    {phv.ltad.description}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, {
                      width: `${phv.ltad.progressPercent}%`,
                      backgroundColor: colors.accent,
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

  // Section headers
  sectionHeader: { marginBottom: spacing.xs },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  sectionSubtitle: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },

  // WHOOP banner
  whoopBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.compact,
    borderRadius: borderRadius.lg, borderWidth: 1,
  },
  whoopBannerText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full },
  sourcePillText: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 0.5 },

  // Stale data banner
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, paddingLeft: spacing.sm,
  },
  staleBannerText: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
  syncCtaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, marginTop: 12, marginBottom: 8,
  },
  syncCtaText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // Freshness badge
  freshnessBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  freshnessDot: { width: 6, height: 6, borderRadius: 3 },
  freshnessText: { fontFamily: fontFamily.medium, fontSize: 10 },
  freshnessDotSmall: { width: 5, height: 5, borderRadius: 2.5 },

  // Real-time cards
  realTimeRow: { flexDirection: 'row', gap: spacing.sm },
  realTimeCard: {
    flex: 1, alignItems: 'center', gap: 3,
    paddingVertical: spacing.compact, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  realTimeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  realTimeEmoji: { fontSize: 18 },
  realTimeValue: { fontFamily: fontFamily.bold, fontSize: 20 },
  realTimeUnit: { fontFamily: fontFamily.regular, fontSize: 11 },
  realTimeLabel: { fontFamily: fontFamily.medium, fontSize: 11 },
  realTimeTimeAgo: { fontFamily: fontFamily.regular, fontSize: 9 },

  // Hero
  heroCenter: { alignItems: 'center', gap: spacing.sm },
  readinessCircle: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  readinessScore: { fontFamily: fontFamily.bold, fontSize: 36 },
  readinessLabel: { fontFamily: fontFamily.medium, fontSize: 13, marginTop: -4 },
  heroTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  heroSummary: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  // Check-in CTA
  checkinCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: borderRadius.md, marginTop: spacing.sm,
  },
  checkinCtaText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#FFF' },

  // Tap hint
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  tapHintText: { fontFamily: fontFamily.regular, fontSize: 11 },

  // Mini stats
  miniStatsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  miniStat: {
    alignItems: 'center', gap: 2,
    paddingHorizontal: spacing.compact, paddingVertical: spacing.xs, borderRadius: borderRadius.sm,
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
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.sm,
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
    flexDirection: 'row', gap: 10, padding: spacing.compact,
    borderRadius: borderRadius.md, borderWidth: 1, marginTop: spacing.xs,
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
