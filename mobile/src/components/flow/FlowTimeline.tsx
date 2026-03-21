/**
 * FlowTimeline — Vertical event timeline matching prototype design
 *
 * Layout per event row: [time column] [colored dot + line] [card with tinted bg + left border]
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance, usePulse } from '../../hooks/useAnimations';
import { getIntensityConfig } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  events: CalendarEvent[];
  completedEventIds: Set<string>;
  onComplete: (eventId: string) => void;
  onSkip: (eventId: string) => void;
  onUndo: (eventId: string) => void;
  /** When true, hides action buttons (DONE/SKIP/UNDO). Used for coach/parent read-only view. */
  readOnly?: boolean;
}

// ─── Color + emoji mapping by event type (matches prototype) ────────────────

const TYPE_EMOJIS: Record<string, string> = {
  training: '⚡',
  match: '⚽',
  study_block: '📚',
  exam: '📝',
  recovery: '🧘',
  other: '📋',
};

function getTypeColor(type: string, colors: ThemeColors): string {
  const map: Record<string, string> = {
    training: colors.accent,
    match: colors.accent,
    study_block: colors.warning,
    exam: colors.error,
    recovery: colors.info,
    other: colors.textDisabled,
  };
  return map[type] ?? colors.textDisabled;
}

function getTypeEmoji(type: string): string {
  return TYPE_EMOJIS[type] ?? '📋';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentEventIndex(events: CalendarEvent[], completedIds: Set<string>): number {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < events.length; i++) {
    if (completedIds.has(events[i].id)) continue;
    const evt = events[i];
    if (evt.startTime && evt.endTime) {
      const [sh, sm] = evt.startTime.split(':').map(Number);
      const [eh, em] = evt.endTime.split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (currentMinutes >= start && currentMinutes <= end) return i;
    }
  }

  for (let i = 0; i < events.length; i++) {
    if (completedIds.has(events[i].id)) continue;
    const evt = events[i];
    if (evt.startTime) {
      const [sh, sm] = evt.startTime.split(':').map(Number);
      if (sh * 60 + sm > currentMinutes) return i;
    }
  }

  return -1;
}

// ─── TimelineEvent ──────────────────────────────────────────────────────────

function TimelineEvent({
  event,
  index,
  isCompleted,
  isCurrent,
  isLast,
  onComplete,
  onSkip,
  onUndo,
  readOnly,
  colors,
}: {
  event: CalendarEvent;
  index: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isLast: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onUndo: (id: string) => void;
  readOnly?: boolean;
  colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  const typeColor = getTypeColor(event.type, colors);
  const emoji = getTypeEmoji(event.type);
  const entranceStyle = useSpringEntrance(index, 100);
  const pulseStyle = usePulse(1, 1.08);
  const intensityConfig = event.intensity ? getIntensityConfig(event.intensity) : null;

  const handleComplete = () => {
    onComplete(event.id);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSkip = () => {
    onSkip(event.id);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleUndo = () => {
    onUndo(event.id);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return (
    <Animated.View style={[entranceStyle, isCompleted && { opacity: 0.45 }]}>
      <View style={styles.eventRow}>
        {/* Left: time column */}
        <View style={styles.timeCol}>
          {event.startTime && (
            <Text style={styles.timeText}>{event.startTime}</Text>
          )}
        </View>

        {/* Center: dot + line */}
        <View style={styles.dotCol}>
          {index > 0 && (
            <View style={[styles.lineSegment, styles.lineAbove, { backgroundColor: colors.glassBorder }]} />
          )}
          <View
            style={[
              styles.dot,
              { backgroundColor: isCompleted ? colors.success : typeColor },
            ]}
          />
          {!isLast && (
            <View style={[styles.lineSegment, styles.lineBelow, { backgroundColor: colors.glassBorder }]} />
          )}
        </View>

        {/* Right: event card with colored left border + tinted bg */}
        <View
          style={[
            styles.eventCard,
            {
              borderLeftWidth: 3,
              borderLeftColor: typeColor,
              backgroundColor: typeColor + '10',
            },
          ]}
        >
          <View style={styles.eventHeader}>
            <View style={[{ flex: 1 }]}>
              <Text
                style={[
                  styles.eventName,
                  { color: colors.textOnDark },
                  isCompleted && styles.eventNameCompleted,
                ]}
                numberOfLines={1}
              >
                {emoji} {event.name}
              </Text>
            </View>
            {isCurrent && !isCompleted && (
              <Animated.View style={[styles.nowBadge, pulseStyle]}>
                <Text style={styles.nowText}>NOW</Text>
              </Animated.View>
            )}
            {isCompleted && !readOnly && (
              <Pressable onPress={handleUndo} style={styles.undoBtn}>
                <Ionicons name="arrow-undo" size={14} color={colors.textOnAccent} />
                <Text style={styles.undoText}>UNDO</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.eventMeta}>
            {event.startTime && event.endTime && (
              <Text style={[styles.eventTime, { color: colors.textInactive }]}>
                {event.startTime} – {event.endTime}
              </Text>
            )}
            {intensityConfig && (
              <View style={[styles.intensityBadge, { backgroundColor: intensityConfig.bgColor }]}>
                <Text style={[styles.intensityText, { color: intensityConfig.color }]}>
                  {intensityConfig.label}
                </Text>
              </View>
            )}
          </View>

          {/* Auto-scheduled note for study blocks */}
          {event.type === 'study_block' && event.notes && event.notes.toLowerCase().includes('auto') && (
            <Text style={[styles.autoNote, { color: colors.warning }]}>
              📝 Exam prep — Tomo auto-scheduled
            </Text>
          )}

          {/* Action buttons for current event (hidden in readOnly mode) */}
          {isCurrent && !isCompleted && !readOnly && (
            <View style={styles.actionRow}>
              <Pressable
                onPress={handleComplete}
                style={[styles.actionBtn, { backgroundColor: colors.success + '20' }]}
              >
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.actionText, { color: colors.success }]}>DONE</Text>
              </Pressable>
              <Pressable
                onPress={handleSkip}
                style={[styles.actionBtn, { backgroundColor: colors.textMuted + '20' }]}
              >
                <Ionicons name="play-skip-forward" size={16} color={colors.textMuted} />
                <Text style={[styles.actionText, { color: colors.textMuted }]}>SKIP</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── FlowTimeline (main export) ─────────────────────────────────────────────

export function FlowTimeline({ events, completedEventIds, onComplete, onSkip, onUndo, readOnly }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const currentIndex = useMemo(
    () => getCurrentEventIndex(events, completedEventIds),
    [events, completedEventIds],
  );

  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="calendar-outline" size={32} color={colors.textInactive} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No events today
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((event, i) => (
        <TimelineEvent
          key={event.id}
          event={event}
          index={i}
          isCompleted={completedEventIds.has(event.id)}
          isCurrent={i === currentIndex}
          isLast={i === events.length - 1}
          onComplete={onComplete}
          onSkip={onSkip}
          onUndo={onUndo}
          readOnly={readOnly}
          colors={colors}
        />
      ))}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 0,
    },
    eventRow: {
      flexDirection: 'row',
      minHeight: 60,
    },

    // Time column (left)
    timeCol: {
      width: 44,
      alignItems: 'flex-end',
      paddingRight: 8,
      paddingTop: 8,
    },
    timeText: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      fontVariant: ['tabular-nums'],
    },

    // Dot + line column (center)
    dotCol: {
      width: 20,
      alignItems: 'center',
    },
    lineSegment: {
      width: 2,
      flex: 1,
    },
    lineAbove: {
      marginBottom: 0,
    },
    lineBelow: {
      marginTop: 0,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },

    // Event card (right)
    eventCard: {
      flex: 1,
      marginLeft: 8,
      marginBottom: spacing.sm,
      padding: 10,
      borderRadius: borderRadius.md,
    },
    eventHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    eventName: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      flex: 1,
    },
    eventNameCompleted: {
      textDecorationLine: 'line-through',
    },
    nowBadge: {
      backgroundColor: colors.accent,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    nowText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      color: colors.textOnAccent,
      letterSpacing: 1,
    },
    eventMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    eventTime: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
    },
    intensityBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    intensityText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
    },
    autoNote: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
    },
    actionText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.5,
    },
    undoBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: colors.accent2,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
    },
    undoText: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      color: colors.textOnAccent,
      letterSpacing: 0.5,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    emptyText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },
  });
}
