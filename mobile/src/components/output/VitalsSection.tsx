/**
 * VitalsSection — Unified card pattern matching Own It recommendations.
 * Two sections: "Right Now" (real-time vitals) + "This Week" (stories + groups).
 * Each card: collapsed title → expanded context + "Ask Tomo" button.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import type { OutputSnapshot, VitalGroup, VitalMetric } from '../../services/api';
import { getRagColor, getTrendIcon, getTrendColor, getGroupThemeColor, getZoneBadgeColor, getZoneBadgeBg, getBaselineText, getStoryStatusColor } from './outputTypes';
import type { VitalStoryBlock } from '../../services/api';

interface Props {
  vitals: OutputSnapshot['vitals'];
  isWhoopConnected?: boolean;
  onSyncNow?: () => void;
}

// Freshness colors
const FRESHNESS_COLORS: Record<string, string> = {
  fresh: '#30D158',
  aging: '#F39C12',
  stale: '#E74C3C',
  no_data: '#6B6B6B',
};

// ── Metric title builder ──────────────────────────────────────────────
function buildVitalTitle(m: any): string {
  if (m.value == null) return m.label;
  const val = Number.isInteger(m.value) ? m.value : m.value.toFixed(1);
  return `${m.label} — ${val}${m.unit}`;
}

// ═════════════════════════════════════════════════════════════════════

export function VitalsSection({ vitals, isWhoopConnected = false, onSyncNow }: Props) {
  const { colors } = useTheme();
  const realTime = (vitals as any).realTime;
  const historical = (vitals as any).historical;
  const effectiveGroups = historical?.vitalGroups ?? vitals.vitalGroups;
  const stories: VitalStoryBlock[] = historical?.stories ?? [];
  const hasVitalData = effectiveGroups && effectiveGroups.some((g: VitalGroup) => g.metrics.length > 0);
  const overallFreshness = realTime?.overallFreshness ?? 'no_data';
  const staleBanner = realTime?.staleBanner ?? null;
  const realTimeMetrics = realTime?.metrics ?? [];
  const { phv } = vitals;

  return (
    <View style={styles.container}>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BLOCK 1: RIGHT NOW                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Right Now</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Latest readings</Text>
      </View>

      {realTimeMetrics.map((m: any) => (
        <VitalCard key={m.metric} metric={m} colors={colors} />
      ))}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BLOCK 2: THIS WEEK                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>This Week</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>7-day insights</Text>
      </View>

      {/* Story Blocks */}
      {stories.map((story: VitalStoryBlock) => (
        <StoryCard key={story.storyId} story={story} colors={colors} />
      ))}

      {/* Vital Groups */}
      {hasVitalData && effectiveGroups.map((group: VitalGroup, index: number) => (
        group.metrics.length > 0 && (
          <VitalGroupCard
            key={group.groupId}
            group={group}
            phv={group.groupId === 'body_growth' ? phv : null}
            colors={colors}
          />
        )
      ))}

      {/* Empty State */}
      {!hasVitalData && !staleBanner?.show && realTimeMetrics.length === 0 && (
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

// ── Ask Tomo Button (shared) ─────────────────────────────────────────

function AskTomoButton({ prompt, colors }: { prompt: string; colors: any }) {
  const navigation = useNavigation<any>();
  return (
    <Pressable
      onPress={() => {
        navigation.navigate('Main', {
          screen: 'MainTabs',
          params: {
            screen: 'Chat',
            params: { prefillMessage: prompt, newSession: true },
          },
        });
      }}
      style={[styles.askTomoButton, { backgroundColor: 'rgba(0, 217, 255, 0.12)', borderColor: 'rgba(0, 217, 255, 0.3)', borderWidth: 1 }]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.info} />
      <Text style={[styles.askTomoText, { color: colors.info }]}>Ask Tomo about this</Text>
    </Pressable>
  );
}

// ── Real-Time Vital Card (collapsed/expanded, matching Own It) ───────

function VitalCard({ metric, colors }: { metric: any; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const freshnessColor = FRESHNESS_COLORS[metric.freshness] || FRESHNESS_COLORS.no_data;
  const zoneColor = getZoneBadgeColor(metric.zone);
  const isStale = metric.freshness === 'stale' || metric.freshness === 'no_data';

  const title = buildVitalTitle(metric);
  const baselineText = getBaselineText(metric.baselineDeviation);
  // Context comes from backend contextInsight (rich, cross-referenced with training/recovery)
  const context = metric.contextInsight
    || (metric.freshness === 'stale' ? 'This reading is stale — sync your wearable for fresh data.'
    : metric.freshness === 'no_data' ? 'No data yet. Connect a wearable to start tracking.'
    : `Your latest ${metric.label.toLowerCase()} reading.`);

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header — always visible */}
        <View style={[styles.cardHeader, isStale && { opacity: 0.6 }]}>
          <Text style={styles.cardEmoji}>{metric.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textOnDark }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {/* Freshness dot */}
          <View style={[styles.freshnessDot, { backgroundColor: freshnessColor }]} />
          {/* Zone badge */}
          {metric.zone && (
            <View style={[styles.zonePill, { backgroundColor: getZoneBadgeBg(metric.zone) }]}>
              <Text style={[styles.zonePillText, { color: zoneColor }]}>
                {metric.zone === 'elite' ? 'Elite' : metric.zone === 'good' ? 'Good' : metric.zone === 'average' ? 'Avg' : metric.zone === 'developing' ? 'Dev' : 'Low'}
              </Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>

        {/* Subtitle — always visible */}
        <View style={styles.cardSubtitleRow}>
          <Text style={[styles.cardTimeAgo, { color: freshnessColor }]}>
            {metric.freshness === 'no_data' ? 'No data' : metric.timeAgo}
          </Text>
          {metric.syncTimeAgo && metric.syncTimeAgo !== metric.timeAgo ? (
            <Text style={[styles.cardBaseline, { color: colors.textMuted }]}> · Synced {metric.syncTimeAgo}</Text>
          ) : null}
          {baselineText ? (
            <Text style={[styles.cardBaseline, { color: colors.textMuted }]}> · {baselineText}</Text>
          ) : null}
        </View>

        {/* Expanded content */}
        {expanded && (
          <View style={styles.expandedBody}>
            <Text style={[styles.cardContext, { color: colors.textMuted }]}>{context}</Text>
            <AskTomoButton
              prompt={`My ${metric.label} is ${metric.value != null ? metric.value : 'unavailable'}${metric.unit}${metric.zoneLabel ? ` (${metric.zoneLabel})` : ''}. ${baselineText || ''} What does this mean for my training today?`}
              colors={colors}
            />
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

// ── Story Card (collapsed/expanded, matching Own It) ─────────────────

function StoryCard({ story, colors }: { story: VitalStoryBlock; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = getStoryStatusColor(story.status);
  const statusLabel = story.status === 'strong' ? 'Strong' : story.status === 'mixed' ? 'Mixed' : 'Weak';

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{story.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textOnDark }]}>{story.title}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>

        {/* Collapsed preview */}
        {!expanded && (
          <Text style={[styles.cardPreview, { color: colors.textMuted }]} numberOfLines={1}>
            {story.narrative}
          </Text>
        )}

        {/* Expanded content */}
        {expanded && (
          <View style={styles.expandedBody}>
            <Text style={[styles.cardContext, { color: colors.textMuted }]}>{story.narrative}</Text>
            <View style={styles.pillRow}>
              {story.contributingMetrics.map((m) => (
                <View key={m} style={[styles.metricPill, { backgroundColor: colors.glass }]}>
                  <Text style={[styles.metricPillText, { color: colors.textMuted }]}>{m.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
            <AskTomoButton
              prompt={`My ${story.title.toLowerCase()} status is ${story.status}: ${story.narrative} What should I focus on?`}
              colors={colors}
            />
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

// ── Vital Group Card (collapsed/expanded + Ask Tomo) ─────────────────

function VitalGroupCard({ group, phv, colors }: {
  group: VitalGroup;
  phv: OutputSnapshot['vitals']['phv'] | null;
  colors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const themeColor = getGroupThemeColor(group.colorTheme);
  const ragColor = getRagColor(group.ragStatus);
  const previewMetrics = group.metrics.slice(0, 2);

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{group.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textOnDark }]}>{group.displayName}</Text>
          </View>
          {group.ragStatus !== 'none' && (
            <View style={[styles.statusDot, { backgroundColor: ragColor }]} />
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>

        {/* Collapsed: preview metrics */}
        {!expanded && previewMetrics.length > 0 && (
          <View style={styles.pillRow}>
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

        {/* Expanded: full metric list + description + Ask Tomo */}
        {expanded && (
          <View style={styles.expandedBody}>
            <Text style={[styles.cardContext, { color: colors.textMuted }]}>
              {group.athleteDescription}
            </Text>

            {group.metrics.map((m) => (
              <MetricRow key={m.metric} metric={m} themeColor={themeColor} colors={colors} />
            ))}

            {/* PHV/LTAD inside Body & Growth */}
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
                  <View style={styles.pillRow}>
                    {phv.ltad.trainingFocus.map((f, i) => (
                      <View key={i} style={[styles.metricPill, { backgroundColor: colors.border }]}>
                        <Text style={[styles.metricPillText, { color: colors.textOnDark }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            <AskTomoButton
              prompt={`Tell me about my ${group.displayName.toLowerCase()} vitals this week. ${group.metrics.map(m => `${m.label}: ${m.avg}${m.unit} (${m.trend} ${Math.abs(m.trendPercent)}%)`).join(', ')}. What should I focus on?`}
              colors={colors}
            />
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

// ── Metric Row ───────────────────────────────────────────────────────

function MetricRow({ metric, themeColor, colors }: {
  metric: VitalMetric; themeColor: string; colors: any;
}) {
  const trendColor = getTrendColor(metric.trend);
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricRowEmoji}>{metric.emoji}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabel, { color: colors.textOnDark }]}>{metric.label}</Text>
          {metric.zone && (
            <View style={[styles.zoneDotSmall, { backgroundColor: getZoneBadgeColor(metric.zone) }]} />
          )}
          {metric.zone && (
            <Text style={[styles.zoneTextSmall, { color: getZoneBadgeColor(metric.zone) }]}>
              {metric.zone === 'elite' ? 'Elite' : metric.zone === 'good' ? 'Good' : metric.zone === 'average' ? 'Avg' : metric.zone === 'developing' ? 'Dev' : 'Low'}
            </Text>
          )}
        </View>
        <Text style={[styles.metricSummary, { color: colors.textMuted }]} numberOfLines={2}>
          {metric.summary}
        </Text>
      </View>
      <View style={styles.metricValueCol}>
        <Text style={[styles.metricValue, { color: themeColor }]}>
          {metric.avg != null ? (Number.isInteger(metric.avg) ? metric.avg : metric.avg.toFixed(1)) : '—'}
          <Text style={styles.metricUnit}>{metric.unit !== 'steps' ? metric.unit : ''}</Text>
        </Text>
        <Text style={[styles.metricTrend, { color: trendColor }]}>
          {getTrendIcon(metric.trend)}{metric.trendPercent ? ` ${Math.abs(metric.trendPercent)}%` : ''}
        </Text>
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

  // Stale banner
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, paddingLeft: spacing.sm,
  },
  staleBannerText: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },

  // ── Unified card pattern ──
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardEmoji: { fontSize: 20 },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  cardSubtitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 28 },
  cardTimeAgo: { fontFamily: fontFamily.regular, fontSize: 11 },
  cardBaseline: { fontFamily: fontFamily.regular, fontSize: 11 },
  cardPreview: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 6, marginLeft: 28 },
  cardContext: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },

  expandedBody: { marginTop: spacing.sm, gap: spacing.sm },

  // Freshness
  freshnessDot: { width: 6, height: 6, borderRadius: 3 },

  // Zone
  zonePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.full },
  zonePillText: { fontFamily: fontFamily.semiBold, fontSize: 9 },

  // Status
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: fontFamily.semiBold, fontSize: 11 },

  // Shared pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: spacing.xs },
  metricPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full },
  metricPillText: { fontFamily: fontFamily.regular, fontSize: 10, textTransform: 'capitalize' },

  // Preview chips
  previewChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.sm,
  },
  previewLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
  previewValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  previewTrend: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Ask Tomo button (matches Own It pattern exactly)
  askTomoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, marginTop: spacing.xs,
  },
  askTomoText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // Metric rows inside groups
  metricRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  metricRowEmoji: { fontSize: 16, marginTop: 2 },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricLabel: { fontFamily: fontFamily.medium, fontSize: 13 },
  zoneDotSmall: { width: 6, height: 6, borderRadius: 3 },
  zoneTextSmall: { fontFamily: fontFamily.medium, fontSize: 10 },
  metricSummary: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },
  metricValueCol: { alignItems: 'flex-end' },
  metricValue: { fontFamily: fontFamily.bold, fontSize: 16 },
  metricUnit: { fontFamily: fontFamily.regular, fontSize: 11 },
  metricTrend: { fontFamily: fontFamily.medium, fontSize: 11, marginTop: 2 },

  // PHV banner
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

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.huge, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg },
});
