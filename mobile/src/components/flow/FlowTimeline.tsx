/**
 * FlowTimeline — Vertical event timeline with status indicators
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance, usePulse } from '../../hooks/useAnimations';
import {
  getEventTypeColor,
  getIntensityConfig,
  getSportDotColor,
  getSportLabel,
} from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  events: CalendarEvent[];
  completedEventIds: Set<string>;
  onComplete: (eventId: string) => void;
  onSkip: (eventId: string) => void;
  onUndo: (eventId: string) => void;
}

type EventIconName = 'barbell' | 'trophy' | 'leaf' | 'book' | 'school' | 'ellipsis-horizontal';

const EVENT_ICONS: Record<string, EventIconName> = {
  training: 'barbell',
  match: 'trophy',
  recovery: 'leaf',
  study_block: 'book',
  exam: 'school',
  other: 'ellipsis-horizontal',
};

function getCurrentEventIndex(events: CalendarEvent[], completedIds: Set<string>): number {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Check for currently active event
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

  // Find next upcoming event
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

function hasHighLoadWarning(events: CalendarEvent[], index: number): boolean {
  if (index >= events.length - 1) return false;
  const curr = events[index];
  const next = events[index + 1];
  if (curr.intensity !== 'HARD' || next.intensity !== 'HARD') return false;
  if (!curr.endTime || !next.startTime) return false;
  const [ceh, cem] = curr.endTime.split(':').map(Number);
  const [nsh, nsm] = next.startTime.split(':').map(Number);
  const gap = (nsh * 60 + nsm) - (ceh * 60 + cem);
  return gap < 240; // within 4 hours
}

function TimelineEvent({
  event,
  index,
  isCompleted,
  isCurrent,
  isLast,
  showLoadWarning,
  onComplete,
  onSkip,
  onUndo,
  colors,
}: {
  event: CalendarEvent;
  index: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isLast: boolean;
  showLoadWarning: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onUndo: (id: string) => void;
  colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  const typeColor = getEventTypeColor(event.type);
  const icon = EVENT_ICONS[event.type] ?? 'ellipsis-horizontal';
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
    <Animated.View style={entranceStyle}>
      <View style={styles.eventRow}>
        {/* Left: timeline line + icon */}
        <View style={styles.timelineCol}>
          {/* Connecting line above */}
          {index > 0 && (
            <View style={[styles.lineSegment, styles.lineAbove, { backgroundColor: colors.glassBorder }]} />
          )}
          {/* Icon circle */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: typeColor + '20', borderColor: typeColor },
              isCompleted && styles.iconCircleCompleted,
            ]}
          >
            {isCompleted ? (
              <Ionicons name="checkmark" size={14} color={colors.success} />
            ) : (
              <Ionicons name={icon} size={14} color={typeColor} />
            )}
          </View>
          {/* Connecting line below */}
          {!isLast && (
            <View style={[styles.lineSegment, styles.lineBelow, { backgroundColor: colors.glassBorder }]} />
          )}
        </View>

        {/* Right: event card */}
        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <View style={[{ flex: 1 }, isCompleted && { opacity: 0.5 }]}>
              <Text
                style={[
                  styles.eventName,
                  { color: colors.textOnDark },
                  isCompleted && styles.eventNameCompleted,
                ]}
                numberOfLines={1}
              >
                {event.name}
              </Text>
            </View>
            {isCurrent && (
              <Animated.View style={[styles.nowBadge, pulseStyle]}>
                <Text style={styles.nowText}>NOW</Text>
              </Animated.View>
            )}
            {isCompleted && (
              <Pressable
                onPress={handleUndo}
                style={styles.undoBtn}
              >
                <Ionicons name="arrow-undo" size={14} color="#FFFFFF" />
                <Text style={styles.undoText}>UNDO</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.eventMeta, isCompleted && { opacity: 0.5 }]}>
            {event.startTime && (
              <Text style={[styles.eventTime, { color: colors.textInactive }]}>
                {event.startTime}
                {event.endTime ? ` – ${event.endTime}` : ''}
              </Text>
            )}
            {event.sport && event.sport !== 'general' && (
              <View style={[styles.sportBadge, { backgroundColor: getSportDotColor(event.sport) + '20' }]}>
                <View style={[styles.sportDot, { backgroundColor: getSportDotColor(event.sport) }]} />
                <Text style={[styles.sportText, { color: getSportDotColor(event.sport) }]}>
                  {getSportLabel(event.sport)}
                </Text>
              </View>
            )}
            {intensityConfig && (
              <View style={[styles.intensityBadge, { backgroundColor: intensityConfig.bgColor }]}>
                <Text style={[styles.intensityText, { color: intensityConfig.color }]}>
                  {intensityConfig.label}
                </Text>
              </View>
            )}
          </View>

          {/* Action buttons for current event */}
          {isCurrent && !isCompleted && (
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

      {/* High load warning */}
      {showLoadWarning && (
        <View style={[styles.loadWarning, { backgroundColor: colors.warning + '15' }]}>
          <Ionicons name="warning" size={12} color={colors.warning} />
          <Text style={[styles.loadWarningText, { color: colors.warning }]}>
            High load — 2 intense sessions close together
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export function FlowTimeline({ events, completedEventIds, onComplete, onSkip, onUndo }: Props) {
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
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>TIMELINE</Text>
      {events.map((event, i) => (
        <TimelineEvent
          key={event.id}
          event={event}
          index={i}
          isCompleted={completedEventIds.has(event.id)}
          isCurrent={i === currentIndex}
          isLast={i === events.length - 1}
          showLoadWarning={hasHighLoadWarning(events, i)}
          onComplete={onComplete}
          onSkip={onSkip}
          onUndo={onUndo}
          colors={colors}
        />
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 0,
    },
    sectionTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 1.5,
      marginBottom: spacing.sm,
    },
    eventRow: {
      flexDirection: 'row',
      minHeight: 60,
    },
    timelineCol: {
      width: 36,
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
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    iconCircleCompleted: {
      backgroundColor: 'rgba(48, 209, 88, 0.15)',
      borderColor: '#2ECC71',
    },
    eventCard: {
      flex: 1,
      marginLeft: spacing.sm,
      marginBottom: spacing.md,
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
      backgroundColor: '#2ECC71',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    nowText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      color: '#FFFFFF',
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
    sportBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    sportDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    sportText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
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
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    loadWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
      marginLeft: 44,
      marginBottom: spacing.sm,
    },
    loadWarningText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
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
