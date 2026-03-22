/**
 * SpineTimeline — Connected vertical spine with glowing junction dots.
 * Each event renders as a GlassCard connected to the spine.
 * Dot color matches event type. Spine line connects events visually.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { getEventTypeColor } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';

// ── Event type badge labels ──────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  training: 'TRAINING',
  match: 'MATCH',
  recovery: 'RECOVERY',
  study_block: 'STUDY',
  exam: 'EXAM',
  other: 'OTHER',
};

const TYPE_EMOJIS: Record<string, string> = {
  training: '⚡',
  match: '⚽',
  recovery: '🧘',
  study_block: '📚',
  exam: '📝',
  other: '📋',
};

// ── Props ────────────────────────────────────────────────────────────

interface SpineTimelineProps {
  events: CalendarEvent[];
  onEventPress?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string) => void;
  onEventSkip?: (eventId: string) => void;
  completedIds?: Set<string>;
  skippedIds?: Set<string>;
}

// ── Format time helper ──────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return '--:--';
  // Handle "HH:MM:SS" or "HH:MM" format
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  return `${String(h).padStart(2, '0')}:${m}`;
}

// ── Component ───────────────────────────────────────────────────────

export function SpineTimeline({
  events,
  onEventPress,
  onEventComplete,
  onEventSkip,
  completedIds = new Set(),
  skippedIds = new Set(),
}: SpineTimelineProps) {
  const { colors } = useTheme();

  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptySpine, { backgroundColor: colors.border }]} />
        <View style={styles.emptyContent}>
          <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Events Today</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Tap + to add training, study, or recovery sessions
          </Text>
        </View>
      </View>
    );
  }

  // Sort events by start time
  const sorted = [...events].sort((a, b) => {
    const aTime = a.startTime || '00:00';
    const bTime = b.startTime || '00:00';
    return aTime.localeCompare(bTime);
  });

  return (
    <View style={styles.container}>
      {sorted.map((event, idx) => {
        const eventColor = getEventTypeColor(event.type);
        const isCompleted = completedIds.has(event.id);
        const isSkipped = skippedIds.has(event.id);
        const isDone = isCompleted || isSkipped;
        const isFirst = idx === 0;
        const isLast = idx === sorted.length - 1;

        return (
          <View key={event.id} style={styles.eventRow}>
            {/* ── Spine column ── */}
            <View style={styles.spineCol}>
              {/* Top line segment */}
              <View
                style={[
                  styles.spineLine,
                  {
                    backgroundColor: isFirst ? 'transparent' : eventColor + '40',
                    flex: 1,
                  },
                ]}
              />
              {/* Glowing dot */}
              <View
                style={[
                  styles.glowDot,
                  {
                    backgroundColor: isDone ? colors.textMuted : eventColor,
                    shadowColor: isDone ? 'transparent' : eventColor,
                    shadowOpacity: isDone ? 0 : 0.6,
                    shadowRadius: isDone ? 0 : 8,
                    shadowOffset: { width: 0, height: 0 },
                  },
                ]}
              />
              {/* Bottom line segment */}
              <View
                style={[
                  styles.spineLine,
                  {
                    backgroundColor: isLast ? 'transparent' : (sorted[idx + 1] ? getEventTypeColor(sorted[idx + 1].type) + '40' : 'transparent'),
                    flex: 1,
                  },
                ]}
              />
            </View>

            {/* ── Event card ── */}
            <Pressable
              style={({ pressed }) => [
                styles.cardWrapper,
                pressed && { opacity: 0.85 },
                isDone && { opacity: 0.5 },
              ]}
              onPress={() => onEventPress?.(event)}
            >
              <GlassCard>
                {/* Time range */}
                <Text style={[styles.timeRange, { color: eventColor }]}>
                  {formatTime(event.startTime)} — {formatTime(event.endTime)}
                </Text>

                {/* Title */}
                <Text style={[styles.eventTitle, { color: colors.textOnDark }]} numberOfLines={1}>
                  {event.name}
                </Text>

                {/* Notes / description */}
                {event.notes ? (
                  <Text style={[styles.eventDesc, { color: colors.textMuted }]} numberOfLines={1}>
                    {event.notes}
                  </Text>
                ) : null}

                {/* Bottom row: type badge + action buttons */}
                <View style={styles.bottomRow}>
                  <View style={[styles.typeBadge, { backgroundColor: eventColor + '20', borderColor: eventColor + '40' }]}>
                    <Text style={[styles.typeBadgeText, { color: eventColor }]}>
                      {TYPE_LABELS[event.type] || 'OTHER'}
                    </Text>
                  </View>

                  {/* Done/Skip buttons */}
                  {!isDone && (onEventComplete || onEventSkip) && (
                    <View style={styles.actionRow}>
                      {onEventComplete && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); onEventComplete(event.id); }}
                          hitSlop={8}
                          style={styles.actionBtn}
                        >
                          <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
                        </Pressable>
                      )}
                      {onEventSkip && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); onEventSkip(event.id); }}
                          hitSlop={8}
                          style={styles.actionBtn}
                        >
                          <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* Done/Skipped indicator */}
                  {isCompleted && (
                    <Text style={[styles.doneLabel, { color: colors.accent }]}>✓ Done</Text>
                  )}
                  {isSkipped && (
                    <Text style={[styles.doneLabel, { color: colors.textMuted }]}>Skipped</Text>
                  )}
                </View>
              </GlassCard>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingLeft: spacing.sm,
  },

  // Event row: spine + card side by side
  eventRow: {
    flexDirection: 'row',
    minHeight: 100,
  },

  // Spine column (dots + lines)
  spineCol: {
    width: 32,
    alignItems: 'center',
  },
  spineLine: {
    width: 2,
    minHeight: 12,
  },
  glowDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    elevation: 6,
  },

  // Card
  cardWrapper: {
    flex: 1,
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
  },

  // Event card content
  timeRange: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  eventTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginBottom: 2,
  },
  eventDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginBottom: 8,
  },

  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 0.5,
  },
  typeBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  actionBtn: {
    padding: 2,
  },
  doneLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    marginLeft: 'auto',
  },

  // Empty state
  emptyContainer: {
    flexDirection: 'row',
    paddingVertical: spacing.huge,
    paddingLeft: spacing.sm,
  },
  emptySpine: {
    width: 2,
    borderRadius: 1,
    marginRight: spacing.md,
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  emptySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
  },
});
