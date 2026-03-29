/**
 * ResponseRenderer — Visual card renderer for structured TomoResponse.
 *
 * Renders stat pills, schedule lists, zone stacks, clash cards,
 * benchmark bars, text cards, coach notes, and action chips.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../hooks/useTheme';
import type {
  TomoResponse,
  VisualCard,
  StatRow,
  StatGrid,
  ScheduleList,
  WeekSchedule,
  ZoneStack,
  ClashList,
  BenchmarkBar,
  TextCard,
  CoachNote,
  ConfirmCard,
  SessionPlan,
  DrillCard,
  SchedulePreviewCard,
  SchedulePreviewEvent,
  ActionChip,
  CapsuleAction,
  ProgramRecommendationCard,
} from '../../types/chat';
import { colors } from '../../theme/colors';
import { CapsuleRenderer, isCapsuleCard } from './capsules/CapsuleRenderer';

// ── Style Factory ────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 8,
    },
    headline: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      lineHeight: 24,
      color: colors.textOnDark,
      marginBottom: 4,
    },

    // Stat Row
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    statLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statEmoji: {
      fontSize: 18,
    },
    statLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    statValue: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    statUnit: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
    },
    trendUp: { color: colors.accent },
    trendDown: { color: colors.error },
    trendFlat: { color: colors.textInactive },

    // Schedule List
    scheduleCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
    },
    scheduleDate: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textInactive,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    scheduleItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 10,
    },
    scheduleTime: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
      width: 50,
    },
    scheduleDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    scheduleTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
      flex: 1,
    },
    scheduleClash: {
      color: colors.error,
    },

    // Week Schedule
    weekScheduleCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
      gap: 4,
    },
    weekScheduleSummary: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
      marginBottom: 8,
      lineHeight: 20,
    },
    weekScheduleDayHeader: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent2 ?? colors.textOnDark,
      marginTop: 10,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    // Zone Stack
    zoneCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
      gap: 6,
    },
    zoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      gap: 10,
    },
    zoneActive: {
      borderWidth: 1.5,
    },
    zoneDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    zoneLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
      flex: 1,
    },
    zoneDetail: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },

    // Clash List
    clashCard: {
      backgroundColor: 'rgba(248, 113, 113, 0.08)',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.2)',
      padding: 12,
      gap: 8,
    },
    clashItem: {
      gap: 2,
    },
    clashEvents: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.error,
    },
    clashTime: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    clashFix: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent,
    },

    // Benchmark Bar
    benchmarkCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
      gap: 6,
    },
    benchmarkHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    benchmarkMetric: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    benchmarkValue: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      color: colors.accent1,
    },
    benchmarkBarBg: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    benchmarkBarFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent1,
    },
    benchmarkFooter: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
    },

    // Text Card
    textCard: {
      gap: 2,
    },
    textCardHeadline: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    textCardBody: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
    },

    // Stat Grid (horizontal scroll on mobile, wrap on wide screens)
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 6,
      overflow: 'visible' as any,
    },
    statGridItem: {
      minWidth: 130,
      maxWidth: 200,
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
      gap: 2,
    },
    statGridItemHighlight: {
      borderWidth: 1,
      borderColor: colors.accent1,
    },
    statGridValue: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    statGridValueHighlight: {
      color: colors.accent1,
    },
    statGridLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
    },

    // Schedule Type Badge
    scheduleTypeBadge: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    scheduleTypeBadgeText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    scheduleClashBorder: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 7,
    },

    // Confirm Card
    confirmCard: {
      backgroundColor: 'rgba(255, 107, 53, 0.06)',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: 'rgba(255, 107, 53, 0.15)',
      padding: 14,
      gap: 8,
    },
    confirmHeadline: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.accent1,
    },
    confirmBody: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    confirmBtn: {
      flex: 1,
      backgroundColor: colors.accent1,
      borderRadius: borderRadius.full,
      paddingVertical: 10,
      alignItems: 'center',
    },
    confirmBtnText: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    cancelBtn: {
      flex: 0.6,
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.full,
      paddingVertical: 10,
      alignItems: 'center',
    },
    cancelBtnText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },

    // Coach Note
    coachNote: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: 'rgba(255, 107, 53, 0.06)',
      borderRadius: borderRadius.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent1,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    coachNoteText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
      flex: 1,
    },

    // Action Chips
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    actionChip: {
      backgroundColor: colors.chipBackground,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    actionChipPressed: {
      opacity: 0.7,
    },
    actionChipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent1,
    },

    // Session Plan
    sessionPlanCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
      gap: 8,
    },
    sessionPlanHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionPlanTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.textOnDark,
      flex: 1,
    },
    sessionPlanMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sessionPlanDuration: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
    },
    sessionPlanReadiness: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: 'hidden',
    },
    sessionPlanItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sessionPlanDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    sessionPlanItemInfo: {
      flex: 1,
    },
    sessionPlanItemName: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },
    sessionPlanItemMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 1,
    },
    sessionPlanIntensity: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },

    // Drill Card
    drillCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 14,
      gap: 10,
    },
    drillCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    drillCardName: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
      flex: 1,
    },
    drillCardIntensity: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: 'hidden',
    },
    drillCardDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textInactive,
    },
    drillCardMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    drillCardMetaPill: {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    drillCardMetaText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textInactive,
    },
    drillCardInstructionRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    drillCardStepNum: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      color: colors.accent1,
      width: 18,
    },
    drillCardStepText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textOnDark,
      flex: 1,
    },
    drillCardTagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    drillCardTag: {
      backgroundColor: 'rgba(255, 107, 53, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    drillCardTagText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      color: colors.accent1,
    },

    // Schedule Preview
    schedulePreviewCard: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      padding: 12,
      gap: 10,
    },
    schedulePreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    schedulePreviewTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    schedulePreviewSummary: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
    },
    schedulePreviewDate: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textInactive,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 4,
    },
    schedulePreviewEvent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    schedulePreviewEventInfo: {
      flex: 1,
    },
    schedulePreviewEventTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },
    schedulePreviewEventTime: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    schedulePreviewViolation: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    schedulePreviewViolationText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      flex: 1,
    },
    schedulePreviewAltsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    schedulePreviewAltChip: {
      backgroundColor: 'rgba(74, 222, 128, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(74, 222, 128, 0.2)',
    },
    schedulePreviewAltText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent,
    },
    schedulePreviewRemoveBtn: {
      padding: 4,
    },
    schedulePreviewConfirmRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    schedulePreviewConfirmBtn: {
      flex: 1,
      backgroundColor: colors.accent1,
      borderRadius: borderRadius.full,
      paddingVertical: 12,
      alignItems: 'center',
    },
    schedulePreviewConfirmText: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    schedulePreviewScenarioBadge: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
      color: colors.accent1,
      backgroundColor: 'rgba(255, 107, 53, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: 'hidden',
    },
  });
}

// ── Card Renderers ───────────────────────────────────────────────

function StatRowCard({ card, styles }: { card: StatRow; styles: ReturnType<typeof createStyles> }) {
  const trendStyle =
    card.trend === 'up'
      ? styles.trendUp
      : card.trend === 'down'
        ? styles.trendDown
        : styles.trendFlat;

  return (
    <View style={styles.statRow}>
      <View style={styles.statLeft}>
        {card.emoji ? <Text style={styles.statEmoji}>{card.emoji}</Text> : null}
        <Text style={styles.statLabel}>{card.label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={[styles.statValue, card.trend ? trendStyle : undefined]}>
          {card.value}
        </Text>
        {card.unit ? <Text style={styles.statUnit}>{card.unit}</Text> : null}
        {card.trend === 'up' ? (
          <Text style={trendStyle}> ↑</Text>
        ) : card.trend === 'down' ? (
          <Text style={trendStyle}> ↓</Text>
        ) : null}
      </View>
    </View>
  );
}

function StatGridCard({
  card,
  styles,
}: {
  card: StatGrid;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
      <View style={styles.statGrid}>
        {(Array.isArray(card.items) ? card.items : []).map((item, i) => (
          <View
            key={i}
            style={[
              styles.statGridItem,
              item.highlight && styles.statGridItemHighlight,
            ]}
          >
            <Text
              style={[
                styles.statGridValue,
                item.highlight && styles.statGridValueHighlight,
              ]}
              numberOfLines={3}
            >
              {item.value}{item.unit ?? ''}
            </Text>
            <Text style={styles.statGridLabel} numberOfLines={2}>{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const SCHEDULE_COLORS: Record<string, string> = {
  training: colors.accent,
  match: colors.accent,
  study: colors.info,
  rest: colors.info,
  exam: colors.error,
  other: colors.textSecondary,
};

const BADGE_LABELS: Record<string, string> = {
  training: 'Train',
  match: 'Match',
  study: 'Study',
  rest: 'Rest',
  exam: 'Exam',
  other: 'Other',
};

function ScheduleListCard({
  card,
  styles,
}: {
  card: ScheduleList;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.scheduleCard}>
      <Text style={styles.scheduleDate}>{card.date}</Text>
      {(Array.isArray(card.items) ? card.items : []).map((item, i) => {
        const badgeColor = SCHEDULE_COLORS[item.type] || SCHEDULE_COLORS.other;
        return (
          <View
            key={i}
            style={[
              styles.scheduleItem,
              item.clash && styles.scheduleClashBorder,
            ]}
          >
            <Text style={styles.scheduleTime}>{item.time}</Text>
            <Text style={[styles.scheduleTitle, item.clash && styles.scheduleClash]}>
              {item.title}
            </Text>
            <View
              style={[
                styles.scheduleTypeBadge,
                {
                  borderColor: item.clash ? colors.accent : badgeColor,
                  backgroundColor: item.clash
                    ? 'rgba(255, 107, 53, 0.12)'
                    : `${badgeColor}15`,
                },
              ]}
            >
              <Text
                style={[
                  styles.scheduleTypeBadgeText,
                  { color: item.clash ? colors.accent : badgeColor },
                ]}
              >
                {item.clash ? '⚡ Clash' : BADGE_LABELS[item.type] || item.type}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function WeekScheduleCard({
  card,
  styles,
}: {
  card: WeekSchedule;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.weekScheduleCard}>
      {card.summary ? (
        <Text style={styles.weekScheduleSummary}>{card.summary}</Text>
      ) : null}
      {(Array.isArray(card.days) ? card.days : []).map((day, di) => (
        <View key={di}>
          <Text style={styles.weekScheduleDayHeader}>{day.dayLabel}</Text>
          {(Array.isArray(day.items) ? day.items : []).map((item, i) => {
            const badgeColor = SCHEDULE_COLORS[item.type] || SCHEDULE_COLORS.other;
            return (
              <View key={i} style={styles.scheduleItem}>
                <Text style={styles.scheduleTime}>{item.time}</Text>
                <Text style={styles.scheduleTitle}>{item.title}</Text>
                <View
                  style={[
                    styles.scheduleTypeBadge,
                    {
                      borderColor: badgeColor,
                      backgroundColor: `${badgeColor}15`,
                    },
                  ]}
                >
                  <Text style={[styles.scheduleTypeBadgeText, { color: badgeColor }]}>
                    {BADGE_LABELS[item.type] || item.type}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const ZONE_COLORS: Record<string, string> = {
  green: colors.accent,
  yellow: colors.warning,
  red: colors.error,
};

function ZoneStackCard({
  card,
  styles,
}: {
  card: ZoneStack;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.zoneCard}>
      {(Array.isArray(card.levels) ? card.levels : []).map((level, i) => {
        const isActive = level.zone === card.current;
        const color = ZONE_COLORS[level.zone];
        return (
          <View
            key={i}
            style={[
              styles.zoneRow,
              isActive && styles.zoneActive,
              isActive && { borderColor: color },
            ]}
          >
            <View style={[styles.zoneDot, { backgroundColor: color }]} />
            <Text style={styles.zoneLabel}>{level.label}</Text>
            <Text style={styles.zoneDetail}>{level.detail}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ClashListCard({
  card,
  styles,
}: {
  card: ClashList;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.clashCard}>
      {(Array.isArray(card.clashes) ? card.clashes : []).map((clash, i) => (
        <View key={i} style={styles.clashItem}>
          <Text style={styles.clashEvents}>
            {clash.event1} × {clash.event2}
          </Text>
          <Text style={styles.clashTime}>{clash.time}</Text>
          <Text style={styles.clashFix}>→ {clash.fix}</Text>
        </View>
      ))}
    </View>
  );
}

function BenchmarkBarCard({
  card,
  styles,
}: {
  card: BenchmarkBar;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.benchmarkCard}>
      <View style={styles.benchmarkHeader}>
        <Text style={styles.benchmarkMetric}>{card.metric}</Text>
        <Text style={styles.benchmarkValue}>
          {card.value} {card.unit}
        </Text>
      </View>
      <View style={styles.benchmarkBarBg}>
        <View
          style={[
            styles.benchmarkBarFill,
            { width: `${Math.min(100, card.percentile)}%` },
          ]}
        />
      </View>
      <Text style={styles.benchmarkFooter}>
        {card.percentile}th percentile · {card.ageBand}
      </Text>
    </View>
  );
}

// ── Program Recommendation Card ─────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = { mandatory: '🔴', high: '🟠', medium: '🟡' };
const CATEGORY_EMOJI: Record<string, string> = {
  speed: '⚡', sprint: '⚡', agility: '🔀', strength: '💪', power: '💥',
  endurance: '🫀', technical: '⚽', injury_prevention: '🩹', mobility: '🧘',
  nordic: '🩹', acl_prevention: '🩹', recovery: '💚',
};

function ProgramRecommendationCardComponent({
  card,
  styles,
  colors,
}: {
  card: ProgramRecommendationCard;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={{ gap: 8 }}>
      {(Array.isArray(card.programs) ? card.programs : []).slice(0, 5).map((p, i) => {
        const emoji = CATEGORY_EMOJI[p.category?.toLowerCase()] ?? '📋';
        const priorityDot = PRIORITY_EMOJI[p.priority] ?? '';
        return (
          <View
            key={p.programId || i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: `${colors.accent1}10`,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 20 }}>{emoji}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontFamily: fontFamily.semiBold,
                  fontSize: 14,
                  color: colors.textOnDark,
                }}
                numberOfLines={1}
              >
                {priorityDot} {p.name}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
                numberOfLines={1}
              >
                {p.weeklyFrequency}x/wk · {p.durationMin}min{p.positionNote ? ` · ${p.positionNote}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
      {card.weeklyPlanSuggestion ? (
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 4,
          }}
        >
          {card.weeklyPlanSuggestion}
        </Text>
      ) : null}
    </View>
  );
}

/** Strip markdown syntax from plain-text card bodies (safety net for AI formatting leaks). */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/`(.+?)`/g, '$1')          // `code` → code
    .replace(/^#+\s+/gm, '')            // # headers
    .replace(/^[-*]\s+/gm, '• ')        // unordered list items → bullet
    .replace(/^\d+\.\s+/gm, '• ');      // numbered list items → bullet
}

function TextCardComponent({
  card,
  styles,
}: {
  card: TextCard;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.textCard}>
      {card.headline ? (
        <Text style={styles.textCardHeadline}>
          {card.emoji ? `${card.emoji} ` : ''}
          {card.headline}
        </Text>
      ) : null}
      <Text style={styles.textCardBody}>{stripMarkdown(card.body)}</Text>
    </View>
  );
}

function CoachNoteCard({
  card,
  styles,
  colors,
}: {
  card: CoachNote;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.coachNote}>
      <Ionicons name="megaphone-outline" size={16} color={colors.accent1} />
      <Text style={styles.coachNoteText}>{card.note}</Text>
    </View>
  );
}

function ConfirmCardComponent({
  card,
  styles,
  onConfirm,
  onCancel,
}: {
  card: ConfirmCard;
  styles: ReturnType<typeof createStyles>;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <View style={styles.confirmCard}>
      <Text style={styles.confirmHeadline}>{card.headline}</Text>
      <Text style={styles.confirmBody}>{card.body}</Text>
      <View style={styles.confirmButtons}>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.confirmBtnText}>{card.confirmLabel}</Text>
        </Pressable>
        {card.cancelLabel ? (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.cancelBtnText}>{card.cancelLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ── Session Plan Card ────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  warmup: colors.warning,
  training: colors.accent,
  cooldown: colors.info,
  recovery: colors.accent,
  activation: colors.info,
};

const INTENSITY_COLORS: Record<string, { bg: string; text: string }> = {
  light: { bg: 'rgba(74, 222, 128, 0.15)', text: colors.accent },
  moderate: { bg: 'rgba(255, 107, 53, 0.15)', text: colors.accent },
  hard: { bg: 'rgba(248, 113, 113, 0.15)', text: colors.error },
};

function SessionPlanCard({
  card,
  styles,
  colors,
  onDrillPress,
}: {
  card: SessionPlan;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onDrillPress?: (action: string) => void;
}) {
  const readinessColor =
    card.readiness === 'Green'
      ? colors.accent
      : card.readiness === 'Yellow'
        ? colors.warning
        : card.readiness === 'Red'
          ? colors.error
          : colors.textInactive;

  return (
    <View style={styles.sessionPlanCard}>
      <View style={styles.sessionPlanHeader}>
        <Text style={styles.sessionPlanTitle}>{card.title}</Text>
        <View style={styles.sessionPlanMeta}>
          <Text style={styles.sessionPlanDuration}>{card.totalDuration}min</Text>
          <Text
            style={[
              styles.sessionPlanReadiness,
              { backgroundColor: `${readinessColor}20`, color: readinessColor },
            ]}
          >
            {card.readiness}
          </Text>
        </View>
      </View>

      {(Array.isArray(card.items) ? card.items : []).map((item, i) => {
        const catColor = CATEGORY_COLORS[item.category] || colors.accent;
        const intColors = INTENSITY_COLORS[item.intensity] || INTENSITY_COLORS.moderate;
        return (
          <Pressable
            key={i}
            style={({ pressed }) => [
              styles.sessionPlanItem,
              i === card.items.length - 1 && { borderBottomWidth: 0 },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() =>
              onDrillPress?.(
                item.drillId
                  ? `Show me drill details for "${item.name}" [drillId:${item.drillId}]`
                  : `Tell me more about the ${item.name} drill`
              )
            }
          >
            <View style={[styles.sessionPlanDot, { backgroundColor: catColor }]} />
            <View style={styles.sessionPlanItemInfo}>
              <Text style={styles.sessionPlanItemName}>{item.name}</Text>
              <Text style={styles.sessionPlanItemMeta}>
                {item.duration}min · {item.category}
                {item.reason ? ` · ${item.reason}` : ''}
              </Text>
            </View>
            <Text
              style={[
                styles.sessionPlanIntensity,
                { backgroundColor: intColors.bg, color: intColors.text },
              ]}
            >
              {item.intensity}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Drill Card ──────────────────────────────────────────────────

function DrillCardComponent({
  card,
  styles,
  colors,
}: {
  card: DrillCard;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const intColors = INTENSITY_COLORS[card.intensity] || INTENSITY_COLORS.moderate;

  return (
    <View style={styles.drillCard}>
      {/* Header */}
      <View style={styles.drillCardHeader}>
        <Text style={styles.drillCardName}>{card.name}</Text>
        <Text
          style={[
            styles.drillCardIntensity,
            { backgroundColor: intColors.bg, color: intColors.text },
          ]}
        >
          {card.intensity}
        </Text>
      </View>

      {/* Description */}
      {card.description ? (
        <Text style={styles.drillCardDesc}>{card.description}</Text>
      ) : null}

      {/* Meta pills: duration, equipment */}
      <View style={styles.drillCardMetaRow}>
        <View style={styles.drillCardMetaPill}>
          <Text style={styles.drillCardMetaText}>⏱ {card.duration}min</Text>
        </View>
        {(Array.isArray(card.equipment) ? card.equipment : []).map((eq, i) => (
          <View key={i} style={styles.drillCardMetaPill}>
            <Text style={styles.drillCardMetaText}>{eq}</Text>
          </View>
        ))}
        {card.progressionCount > 0 ? (
          <View style={styles.drillCardMetaPill}>
            <Text style={styles.drillCardMetaText}>
              📈 {card.progressionCount} progressions
            </Text>
          </View>
        ) : null}
      </View>

      {/* Instructions */}
      {Array.isArray(card.instructions) && card.instructions.length > 0 ? (
        <View style={{ gap: 2 }}>
          {card.instructions.map((step, i) => (
            <View key={i} style={styles.drillCardInstructionRow}>
              <Text style={styles.drillCardStepNum}>{i + 1}.</Text>
              <Text style={styles.drillCardStepText}>{typeof step === 'string' ? step : String(step)}</Text>
            </View>
          ))}
        </View>
      ) : typeof card.instructions === 'string' && card.instructions.length > 0 ? (
        <Text style={styles.drillCardStepText}>{card.instructions}</Text>
      ) : null}

      {/* Tags */}
      {card.tags && card.tags.length > 0 ? (
        <View style={styles.drillCardTagsRow}>
          {(Array.isArray(card.tags) ? card.tags : []).map((tag, i) => (
            <View key={i} style={styles.drillCardTag}>
              <Text style={styles.drillCardTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── Schedule Preview Card ────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  training: colors.accent,
  match: colors.accent,
  study: colors.info,
  gym: colors.info,
  club: colors.accent,
  exam: colors.error,
  recovery: colors.accent,
  rest: colors.textSecondary,
};

const VIOLATION_ICONS: Record<string, string> = {
  overlap: '🔴',
  gap: '🟡',
  intensity_cap: '⛔',
  outside_bounds: '🚫',
  exam_day_restriction: '📚',
  max_sessions: '⚠️',
};

function SchedulePreviewCardComponent({
  card,
  styles,
  colors,
  onChipPress,
  onConfirm,
}: {
  card: SchedulePreviewCard;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onChipPress?: (action: string) => void;
  onConfirm?: () => void;
}) {
  // Group events by date
  const byDate = new Map<string, SchedulePreviewEvent[]>();
  for (const evt of card.events) {
    if (!byDate.has(evt.date)) byDate.set(evt.date, []);
    byDate.get(evt.date)!.push(evt);
  }

  const acceptedCount = card.events.filter((e) => e.accepted).length;

  return (
    <View style={styles.schedulePreviewCard}>
      {/* Header */}
      <View style={styles.schedulePreviewHeader}>
        <View style={{ gap: 2 }}>
          <Text style={styles.schedulePreviewTitle}>Schedule Preview</Text>
          <Text style={styles.schedulePreviewSummary}>
            {acceptedCount} of {card.summary.total} events
            {card.summary.withViolations > 0
              ? ` · ${card.summary.withViolations} need attention`
              : ' ready'}
          </Text>
        </View>
        <Text style={styles.schedulePreviewScenarioBadge}>
          {card.scenario.replace(/_/g, ' ').toUpperCase()}
        </Text>
      </View>

      {/* Events grouped by date */}
      {Array.from(byDate.entries()).map(([date, events]) => (
        <View key={date}>
          <Text style={styles.schedulePreviewDate}>{date}</Text>
          {events.map((evt, i) => {
            const dotColor = EVENT_TYPE_COLORS[evt.event_type] || colors.textSecondary;
            const hasErrors = evt.violations.some((v) => v.severity === 'error');
            const hasWarnings = evt.violations.some((v) => v.severity === 'warning');

            return (
              <View
                key={i}
                style={[
                  styles.schedulePreviewEvent,
                  !evt.accepted && { opacity: 0.4 },
                  i === events.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                {/* Dot */}
                <View
                  style={[
                    styles.sessionPlanDot,
                    { backgroundColor: hasErrors ? colors.error : dotColor },
                  ]}
                />

                {/* Event info */}
                <View style={styles.schedulePreviewEventInfo}>
                  <Text style={styles.schedulePreviewEventTitle}>{evt.title}</Text>
                  <Text style={styles.schedulePreviewEventTime}>
                    {evt.startTime} – {evt.endTime}
                    {evt.intensity ? ` · ${evt.intensity}` : ''}
                  </Text>

                  {/* Violations */}
                  {(Array.isArray(evt.violations) ? evt.violations : []).map((v, vi) => (
                    <View key={vi} style={styles.schedulePreviewViolation}>
                      <Text style={{ fontSize: 11 }}>
                        {VIOLATION_ICONS[v.type] || '⚠️'}
                      </Text>
                      <Text
                        style={[
                          styles.schedulePreviewViolationText,
                          {
                            color:
                              v.severity === 'error' ? colors.error : colors.warning,
                          },
                        ]}
                      >
                        {v.message}
                      </Text>
                    </View>
                  ))}

                  {/* Alternative time chips */}
                  {evt.alternatives.length > 0 && (
                    <View style={styles.schedulePreviewAltsRow}>
                      {(Array.isArray(evt.alternatives) ? evt.alternatives : []).map((alt, ai) => (
                        <Pressable
                          key={ai}
                          style={({ pressed }) => [
                            styles.schedulePreviewAltChip,
                            pressed && { opacity: 0.7 },
                          ]}
                          onPress={() =>
                            onChipPress?.(
                              `Move "${evt.title}" to ${alt.startTime}-${alt.endTime} on ${evt.date}`
                            )
                          }
                        >
                          <Text style={styles.schedulePreviewAltText}>
                            {alt.startTime} – {alt.endTime}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {/* Intensity badge */}
                {evt.intensity && (
                  <Text
                    style={[
                      styles.sessionPlanIntensity,
                      {
                        backgroundColor:
                          INTENSITY_COLORS[evt.intensity.toLowerCase()]?.bg ||
                          'rgba(255,255,255,0.06)',
                        color:
                          INTENSITY_COLORS[evt.intensity.toLowerCase()]?.text ||
                          colors.textInactive,
                      },
                    ]}
                  >
                    {evt.intensity}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Confirm button */}
      <View style={styles.schedulePreviewConfirmRow}>
        <Pressable
          style={({ pressed }) => [
            styles.schedulePreviewConfirmBtn,
            pressed && { opacity: 0.8 },
            card.summary.blocked > 0 && { opacity: 0.5 },
          ]}
          onPress={onConfirm}
          disabled={card.summary.blocked > 0 && acceptedCount === 0}
        >
          <Text style={styles.schedulePreviewConfirmText}>
            Confirm {acceptedCount} Event{acceptedCount !== 1 ? 's' : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Card Router ──────────────────────────────────────────────────

function RenderCard({
  card,
  styles,
  colors,
  onConfirm,
  onCancel,
  onChipPress,
  onCapsuleSubmit,
}: {
  card: VisualCard;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onConfirm?: () => void;
  onCancel?: () => void;
  onChipPress?: (action: string) => void;
  onCapsuleSubmit?: (action: CapsuleAction) => void;
}) {
  // Route capsule card types to CapsuleRenderer
  if (isCapsuleCard(card.type) && onCapsuleSubmit) {
    return <CapsuleRenderer card={card} onSubmit={onCapsuleSubmit} />;
  }

  switch (card.type) {
    case 'stat_row':
      return <StatRowCard card={card} styles={styles} />;
    case 'stat_grid':
      return <StatGridCard card={card} styles={styles} />;
    case 'schedule_list':
      return <ScheduleListCard card={card} styles={styles} />;
    case 'week_schedule':
      return <WeekScheduleCard card={card} styles={styles} />;
    case 'zone_stack':
      return <ZoneStackCard card={card} styles={styles} />;
    case 'clash_list':
      return <ClashListCard card={card} styles={styles} />;
    case 'benchmark_bar':
      return <BenchmarkBarCard card={card} styles={styles} />;
    case 'program_recommendation':
      return <ProgramRecommendationCardComponent card={card as ProgramRecommendationCard} styles={styles} colors={colors} />;
    case 'text_card':
      return <TextCardComponent card={card} styles={styles} />;
    case 'coach_note':
      return <CoachNoteCard card={card} styles={styles} colors={colors} />;
    case 'confirm_card':
      return <ConfirmCardComponent card={card} styles={styles} onConfirm={onConfirm} onCancel={onCancel} />;
    case 'session_plan':
      return <SessionPlanCard card={card} styles={styles} colors={colors} onDrillPress={onChipPress} />;
    case 'drill_card':
      return <DrillCardComponent card={card} styles={styles} colors={colors} />;
    case 'schedule_preview':
      return (
        <SchedulePreviewCardComponent
          card={card}
          styles={styles}
          colors={colors}
          onChipPress={onChipPress}
          onConfirm={onConfirm}
        />
      );
    default: {
      // Fallback: render unhandled card types as text card if they have a body/headline
      const fallback = card as any;
      if (fallback.headline || fallback.body) {
        return (
          <TextCardComponent
            card={{ type: 'text_card', headline: fallback.headline ?? fallback.type, body: fallback.body ?? '', emoji: fallback.emoji }}
            styles={styles}
          />
        );
      }
      return null;
    }
  }
}

// ── Main Component ───────────────────────────────────────────────

interface ResponseRendererProps {
  response: TomoResponse;
  onChipPress?: (action: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCapsuleSubmit?: (action: CapsuleAction) => void;
}

export function ResponseRenderer({
  response,
  onChipPress,
  onConfirm,
  onCancel,
  onCapsuleSubmit,
}: ResponseRendererProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {response.headline ? (
        <Text style={styles.headline}>{response.headline}</Text>
      ) : null}

      {(Array.isArray(response.cards) ? response.cards : []).map((card, i) => (
        <RenderCard
          key={i}
          card={card}
          styles={styles}
          colors={colors}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onChipPress={onChipPress}
          onCapsuleSubmit={onCapsuleSubmit}
        />
      ))}

      {response.chips && response.chips.length > 0 && onChipPress ? (
        <View style={styles.chipsRow}>
          {response.chips.map((chip, i) => (
            <Pressable
              key={i}
              onPress={() => onChipPress(chip.action)}
              style={({ pressed }) => [
                styles.actionChip,
                pressed && styles.actionChipPressed,
              ]}
            >
              <Text style={styles.actionChipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
