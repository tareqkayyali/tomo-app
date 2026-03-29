/**
 * ProactiveDashboard — CMS-driven proactive status card shown in Chat empty state.
 *
 * Reads dashboard config from CMS (via config bundle) and renders dynamically.
 * Falls back to hardcoded defaults when no CMS config exists.
 * 3 sections: Status Strip (pills) → Today Glance → Smart Chips.
 * Fully deterministic, $0 AI cost.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useConfig } from '../../hooks/useConfigProvider';
import type { ThemeColors } from '../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { BootData } from '../../services/api';
import type {
  DashboardConfig,
  DashboardPillConfig,
  DashboardFlagConfig,
  DashboardChipConfig,
} from '../../services/configService';

// ── Props ──────────────────────────────────────────────────────────────

interface ProactiveDashboardProps {
  bootData: BootData;
  onChipPress: (message: string) => void;
}

// ── Default config (matches original hardcoded behavior) ───────────────

const DEFAULT_CONFIG: DashboardConfig = {
  greeting: { enabled: true, showEmoji: true },
  pills: [
    { id: 'readiness', label: 'Ready', emoji: '🟢', dataSource: 'latestCheckin.readiness', format: 'readiness_color', enabled: true, emptyValue: '?', tapAction: 'check in', tapHint: 'Tap to check in', sortOrder: 1 },
    { id: 'sleep', label: 'Sleep', emoji: '😴', dataSource: 'latestCheckin.sleepHours', format: 'hours', enabled: true, emptyValue: '—', sortOrder: 2 },
    { id: 'acwr', label: 'ACWR', emoji: '📊', dataSource: 'snapshot.acwr', format: 'decimal1', enabled: true, emptyValue: '—', colorRules: { green: '>= 0.8', yellow: '< 0.8', red: '> 1.3' }, sortOrder: 3 },
    { id: 'streak', label: 'Streak', emoji: '🔥', dataSource: 'streak', format: 'number', enabled: true, emptyValue: '0', sortOrder: 4 },
  ],
  todaySection: { enabled: true, maxEvents: 3, showEventTime: true, showRestDayMessage: true, restDayMessage: 'Rest day — recovery focus' },
  flags: [
    { id: 'exam', condition: 'hasExamSoon', icon: 'alert-circle', message: 'Exam coming up — pace your load', color: '#F39C12', priority: 1, enabled: true },
    { id: 'injury', condition: 'snapshot.injury_risk_flag == RED', icon: 'alert-circle', message: 'Injury risk elevated — prioritize recovery', color: '#E74C3C', priority: 2, enabled: true },
    { id: 'highLoad', condition: 'snapshot.acwr > 1.3', icon: 'trending-up', message: 'Training load is high — manage intensity', color: '#F39C12', priority: 3, enabled: true },
    { id: 'dualLoad', condition: 'snapshot.dual_load_index > 65', icon: 'warning', message: 'Academic + athletic load elevated', color: '#F39C12', priority: 4, enabled: true },
  ],
  chips: [
    { id: 'checkin', label: 'Check in', message: 'check in', condition: '!hasCheckinToday', priority: 1, enabled: true },
    { id: 'matchPrep', label: 'Match prep', message: 'help me prepare for my match today', condition: 'hasMatch', priority: 2, enabled: true },
    { id: 'studyPlan', label: 'Study plan', message: 'plan my study schedule', condition: 'hasExamSoon', priority: 3, enabled: true },
    { id: 'myLoad', label: 'My load', message: "what's my training load looking like?", condition: 'highLoad', priority: 4, enabled: true },
    { id: 'planDay', label: 'Plan my day', message: 'help me plan my day', condition: 'hasEvents', priority: 5, enabled: true },
    { id: 'recs', label: 'My recommendations', message: 'show me my recommendations', condition: 'hasRecs', priority: 6, enabled: true },
    { id: 'howAmI', label: 'How am I doing?', message: 'how am I doing overall?', condition: 'always', priority: 7, enabled: true },
    { id: 'progress', label: 'My progress', message: 'show me my progress', condition: 'always', priority: 8, enabled: true },
    { id: 'whatTrain', label: 'What should I train?', message: 'what should I train today?', condition: 'always', priority: 9, enabled: true },
  ],
  newUserMessage: 'Start by checking in to unlock your dashboard',
};

// ── Data resolution utilities ──────────────────────────────────────────

function resolveDataSource(bootData: BootData, path: string): any {
  return path.split('.').reduce((obj: any, key) => obj?.[key], bootData);
}

function evaluateCondition(bootData: BootData, condition: string): boolean {
  const todayStr = new Date().toISOString().split('T')[0];

  const named: Record<string, () => boolean> = {
    'always': () => true,
    '!hasCheckinToday': () => bootData.latestCheckin?.date !== todayStr,
    'hasCheckinToday': () => bootData.latestCheckin?.date === todayStr,
    'hasMatch': () => bootData.todayEvents.some(e => e.type === 'match' || e.type === 'competition'),
    'hasExamSoon': () => (bootData.upcomingExams?.length ?? 0) > 0,
    'highLoad': () => (resolveDataSource(bootData, 'snapshot.acwr') ?? 0) > 1.2,
    'hasRecs': () => (bootData.activeRecs?.length ?? 0) > 0,
    'hasEvents': () => bootData.todayEvents.length > 0,
  };

  if (named[condition]) return named[condition]();

  // Simple field comparison: "snapshot.acwr > 1.3", "snapshot.injury_risk_flag == RED"
  const match = condition.match(/^(.+?)\s*(>|<|>=|<=|===|==|!=)\s*(.+)$/);
  if (match) {
    const val = resolveDataSource(bootData, match[1].trim());
    const op = match[2];
    const targetStr = match[3].trim();
    if (val == null) return false;

    // Try numeric comparison
    const targetNum = parseFloat(targetStr);
    if (!isNaN(targetNum)) {
      const numVal = Number(val);
      switch (op) {
        case '>': return numVal > targetNum;
        case '<': return numVal < targetNum;
        case '>=': return numVal >= targetNum;
        case '<=': return numVal <= targetNum;
        case '==': case '===': return numVal === targetNum;
        case '!=': return numVal !== targetNum;
      }
    } else {
      // String comparison
      switch (op) {
        case '==': case '===': return String(val) === targetStr;
        case '!=': return String(val) !== targetStr;
      }
    }
  }

  return false;
}

function formatValue(value: any, format: string, emptyValue: string): string {
  if (value == null || value === undefined) return emptyValue;
  switch (format) {
    case 'number': return String(Math.round(Number(value)));
    case 'decimal1': return Number(value).toFixed(1);
    case 'hours': return `${Number(value)}h`;
    case 'percent': return `${Math.round(Number(value))}%`;
    case 'readiness_color': return getReadinessEmoji(String(value));
    case 'text':
    default: return String(value);
  }
}

function getReadinessEmoji(readiness: string): string {
  const lower = readiness.toLowerCase();
  if (lower === 'green' || lower === 'good') return '🟢';
  if (lower === 'yellow' || lower === 'moderate') return '🟡';
  if (lower === 'red' || lower === 'poor') return '🔴';
  return '❓';
}

function getReadinessColor(readiness: string): string {
  const lower = readiness.toLowerCase();
  if (lower === 'green' || lower === 'good') return '#30D158';
  if (lower === 'yellow' || lower === 'moderate') return '#F39C12';
  if (lower === 'red' || lower === 'poor') return '#E74C3C';
  return '#888';
}

function evaluateColorRule(value: any, rule: string): boolean {
  if (!rule || value == null) return false;
  const numVal = Number(value);
  if (isNaN(numVal)) return false;
  // Parse: ">= 0.8", "< 50", "> 1.3"
  const match = rule.match(/^(>|<|>=|<=|==|!=)\s*(.+)$/);
  if (!match) return false;
  const target = parseFloat(match[2]);
  switch (match[1]) {
    case '>': return numVal > target;
    case '<': return numVal < target;
    case '>=': return numVal >= target;
    case '<=': return numVal <= target;
    case '==': return numVal === target;
    case '!=': return numVal !== target;
  }
  return false;
}

function getPillColor(value: any, colorRules?: DashboardPillConfig['colorRules']): string | undefined {
  if (!colorRules || value == null) return undefined;
  if (colorRules.red && evaluateColorRule(value, colorRules.red)) return '#E74C3C';
  if (colorRules.yellow && evaluateColorRule(value, colorRules.yellow)) return '#F39C12';
  if (colorRules.green && evaluateColorRule(value, colorRules.green)) return '#30D158';
  return undefined;
}

// ── Greeting ───────────────────────────────────────────────────────────

function getGreeting(name: string, customPrefix?: string): string {
  const first = name.split(' ')[0];
  if (customPrefix) return `${customPrefix}, ${first}`;
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Good morning, ${first}`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${first}`;
  if (hour >= 17 && hour < 21) return `Good evening, ${first}`;
  return `Hey, ${first}`;
}

// ── Event helpers ──────────────────────────────────────────────────────

function formatEventTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function getEventTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'training': return 'barbell-outline';
    case 'match': case 'competition': return 'trophy-outline';
    case 'recovery': return 'leaf-outline';
    case 'study': return 'book-outline';
    case 'exam': return 'school-outline';
    case 'gym': return 'fitness-outline';
    default: return 'calendar-outline';
  }
}

// ── Main Component ─────────────────────────────────────────────────────

export const ProactiveDashboard = React.memo(function ProactiveDashboard({
  bootData,
  onChipPress,
}: ProactiveDashboardProps) {
  const { colors } = useTheme();
  const { config: appConfig } = useConfig();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // CMS config with fallback to defaults
  const dashConfig: DashboardConfig = (appConfig?.proactive_dashboard as DashboardConfig) ?? DEFAULT_CONFIG;

  // Entrance animation
  const fadeIn = useSharedValue(0);
  React.useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ translateY: (1 - fadeIn.value) * 12 }],
  }));

  const isNewUser = !bootData.snapshot && !bootData.latestCheckin && bootData.todayEvents.length === 0;

  // ── Resolve pills ──
  const resolvedPills = useMemo(() => {
    return dashConfig.pills
      .filter(p => p.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(pill => {
        const rawValue = resolveDataSource(bootData, pill.dataSource);
        const displayValue = formatValue(rawValue, pill.format, pill.emptyValue);

        // Special handling for readiness — show emoji based on value
        let emoji = pill.emoji;
        if (pill.format === 'readiness_color' && rawValue) {
          emoji = getReadinessEmoji(String(rawValue));
        }

        // Color from rules or readiness
        let color: string | undefined;
        if (pill.colorRules) {
          color = getPillColor(rawValue, pill.colorRules);
        } else if (pill.format === 'readiness_color' && rawValue) {
          color = getReadinessColor(String(rawValue));
        }

        // Show tap hint only when no data (e.g. no checkin → "Tap to check in")
        const showTap = pill.tapAction && rawValue == null;

        return { ...pill, emoji, displayValue, color, showTap };
      });
  }, [bootData, dashConfig.pills]);

  // ── Resolve flag (first matching) ──
  const activeFlag = useMemo(() => {
    const sorted = [...dashConfig.flags]
      .filter(f => f.enabled)
      .sort((a, b) => a.priority - b.priority);
    for (const flag of sorted) {
      if (evaluateCondition(bootData, flag.condition)) {
        return flag;
      }
    }
    return null;
  }, [bootData, dashConfig.flags]);

  // ── Resolve chips (top 3 matching) ──
  const resolvedChips = useMemo(() => {
    return dashConfig.chips
      .filter(c => c.enabled)
      .sort((a, b) => a.priority - b.priority)
      .filter(c => !c.condition || evaluateCondition(bootData, c.condition))
      .slice(0, 3);
  }, [bootData, dashConfig.chips]);

  // ── Today items ──
  const todayConfig = dashConfig.todaySection;
  const todayItems = useMemo(() => {
    if (!todayConfig.enabled) return [];
    return bootData.todayEvents.slice(0, todayConfig.maxEvents).map(e => ({
      icon: getEventTypeIcon(e.type) as string,
      text: e.title,
      time: todayConfig.showEventTime ? formatEventTime(e.startAt) : undefined,
    }));
  }, [bootData.todayEvents, todayConfig]);
  const hasMoreEvents = bootData.todayEvents.length > todayConfig.maxEvents;

  // ── Greeting ──
  const greeting = dashConfig.greeting.enabled
    ? getGreeting(bootData.name, dashConfig.greeting.customPrefix)
    : null;

  // ── Render ──

  // New user variant
  if (isNewUser) {
    return (
      <Animated.View style={[styles.container, animStyle]}>
        <Text style={styles.greeting}>Welcome to Tomo, {bootData.name.split(' ')[0]} 👋</Text>
        <Text style={styles.newUserText}>
          {dashConfig.newUserMessage}
        </Text>
        <View style={styles.chipsRow}>
          {[
            { label: 'Check in', message: 'check in' },
            { label: 'Set up my schedule', message: 'help me set up my schedule' },
            { label: 'Tell me about Tomo', message: 'what can you do?' },
          ].map(chip => (
            <Pressable
              key={chip.label}
              onPress={() => onChipPress(chip.message)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, animStyle]}>
      {/* Greeting */}
      {greeting && (
        <Text style={styles.greeting}>
          {greeting}{dashConfig.greeting.showEmoji ? ' 👋' : ''}
        </Text>
      )}

      {/* Status Strip — dynamic pills */}
      {resolvedPills.length > 0 && (
        <View style={styles.pillsRow}>
          {resolvedPills.map(pill => (
            <Pressable
              key={pill.id}
              onPress={pill.showTap && pill.tapAction ? () => onChipPress(pill.tapAction!) : undefined}
              style={[styles.pill, pill.showTap && styles.pillTappable]}
            >
              <Text style={styles.pillEmoji}>{pill.emoji}</Text>
              <Text style={[styles.pillValue, pill.color ? { color: pill.color } : null]}>
                {pill.displayValue}
              </Text>
              <Text style={styles.pillLabel}>{pill.label}</Text>
              {pill.showTap && pill.tapHint && (
                <Text style={styles.pillHint}>{pill.tapHint}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Today Glance */}
      {todayConfig.enabled && (
        <View style={styles.todaySection}>
          <Text style={styles.todaySectionTitle}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />{' '}
            Today
          </Text>
          {todayItems.length > 0 ? (
            <>
              {todayItems.map((item, i) => (
                <View key={i} style={styles.todayItem}>
                  <Ionicons name={item.icon as any} size={14} color={colors.accent2} />
                  <Text style={styles.todayItemText} numberOfLines={1}>{item.text}</Text>
                  {item.time && <Text style={styles.todayItemTime}>{item.time}</Text>}
                </View>
              ))}
              {hasMoreEvents && (
                <Text style={styles.moreEvents}>
                  +{bootData.todayEvents.length - todayConfig.maxEvents} more
                </Text>
              )}
            </>
          ) : todayConfig.showRestDayMessage ? (
            <Text style={styles.restDay}>{todayConfig.restDayMessage}</Text>
          ) : null}

          {/* Flag */}
          {activeFlag && (
            <View style={[styles.flagRow, { borderLeftColor: activeFlag.color }]}>
              <Ionicons name={activeFlag.icon as any} size={14} color={activeFlag.color} />
              <Text style={[styles.flagText, { color: activeFlag.color }]}>{activeFlag.message}</Text>
            </View>
          )}
        </View>
      )}

      {/* Smart Chips */}
      {resolvedChips.length > 0 && (
        <View style={styles.chipsRow}>
          {resolvedChips.map(chip => (
            <Pressable
              key={chip.id}
              onPress={() => onChipPress(chip.message)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
  );
});

// ── Styles ──────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      backgroundColor: colors.backgroundElevated,
      borderRadius: 16,
      padding: spacing.lg,
      gap: spacing.md,
    },
    greeting: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    newUserText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
    },
    pillsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pill: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 2,
    },
    pillTappable: {
      borderWidth: 1,
      borderColor: 'rgba(0, 217, 255, 0.3)',
      borderStyle: 'dashed',
    },
    pillEmoji: { fontSize: 18 },
    pillValue: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    pillLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    pillHint: {
      fontFamily: fontFamily.regular,
      fontSize: 9,
      color: colors.accent2,
      marginTop: 1,
    },
    todaySection: { gap: 6 },
    todaySectionTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    todayItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    todayItemText: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    todayItemTime: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    moreEvents: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginLeft: 22,
    },
    restDay: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      fontStyle: 'italic',
    },
    flagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      paddingLeft: 8,
      borderLeftWidth: 2,
      paddingVertical: 4,
    },
    flagText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: 4,
    },
    chip: {
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: 'rgba(0, 217, 255, 0.2)',
    },
    chipPressed: {
      opacity: 0.7,
      backgroundColor: 'rgba(0, 217, 255, 0.15)',
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent2,
    },
  });
}
