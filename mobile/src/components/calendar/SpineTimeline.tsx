/**
 * SpineTimeline — Connected vertical spine with glowing junction dots.
 * Each event renders as a GlassCard connected to the spine.
 * Dot color matches event type. Spine line connects events visually.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { SmartIcon } from '../SmartIcon';
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
  training: '',
  match: '',
  recovery: '',
  study_block: '',
  exam: '',
  other: '',
};

// ── Props ────────────────────────────────────────────────────────────

// Journal-eligible event types
const JOURNAL_TYPES = new Set(['training', 'match', 'recovery']);

interface SpineTimelineProps {
  events: CalendarEvent[];
  onEventPress?: (event: CalendarEvent) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string) => void;
  onEventSkip?: (eventId: string) => void;
  onJournalPress?: (event: CalendarEvent) => void;
  completedIds?: Set<string>;
  skippedIds?: Set<string>;
  zoomLevel?: number; // 0.7 - 1.5, default 1.0
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
  onEventEdit,
  onEventComplete,
  onEventSkip,
  onJournalPress,
  completedIds = new Set(),
  skippedIds = new Set(),
  zoomLevel = 1.0,
}: SpineTimelineProps) {
  const { colors } = useTheme();
  const scaledSpacing = (base: number) => Math.round(base * zoomLevel);
  const scaledFont = (base: number) => Math.round(base * zoomLevel);

  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptySpine, { backgroundColor: colors.border }]} />
        <View style={styles.emptyContent}>
          <SmartIcon name="calendar-outline" size={40} color={colors.textMuted} />
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

        // Zoom-scaled dimensions
        const dotSize = scaledSpacing(14);
        const spineWidth = scaledSpacing(32);

        return (
          <View key={event.id} style={[styles.eventRow, { minHeight: scaledSpacing(100) }]}>
            {/* ── Spine column ── */}
            <View style={[styles.spineCol, { width: spineWidth }]}>
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
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
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
                { marginBottom: scaledSpacing(spacing.sm) },
                pressed && { opacity: 0.85 },
                isDone && { opacity: 0.5 },
              ]}
              onPress={() => onEventEdit ? onEventEdit(event) : onEventPress?.(event)}
            >
              <GlassCard>
                {/* Time range */}
                <Text style={[styles.timeRange, { color: eventColor, fontSize: scaledFont(13) }]}>
                  {formatTime(event.startTime)} — {formatTime(event.endTime)}
                </Text>

                {/* Title + Journal badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.eventTitle, { color: colors.textOnDark, flex: 1, fontSize: scaledFont(16) }]} numberOfLines={1}>
                    {event.name}
                  </Text>
                  {JOURNAL_TYPES.has(event.type) && (
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); onJournalPress?.(event); }}
                      hitSlop={8}
                      style={[
                        styles.journalBadge,
                        {
                          backgroundColor: event.journalState === 'complete' ? colors.readinessGreen + '20'
                            : event.journalState === 'pre_set' ? colors.accent2 + '20'
                            : colors.chipBackground,
                          borderColor: event.journalState === 'complete' ? colors.readinessGreen + '40'
                            : event.journalState === 'pre_set' ? colors.accent2 + '40'
                            : colors.glassBorder,
                        },
                      ]}
                    >
                      <SmartIcon
                        name={event.journalState === 'complete' ? 'book' : 'book-outline'}
                        size={12}
                        color={
                          event.journalState === 'complete' ? colors.readinessGreen
                            : event.journalState === 'pre_set' ? colors.accent2
                            : colors.textBody
                        }
                      />
                      <Text style={[
                        styles.journalBadgeText,
                        {
                          color: event.journalState === 'complete' ? colors.readinessGreen
                            : event.journalState === 'pre_set' ? colors.accent2
                            : colors.textBody,
                        },
                      ]}>
                        {event.journalState === 'complete' ? 'Logged'
                          : event.journalState === 'pre_set' ? 'Reflect'
                          : 'Set target'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Notes / description */}
                {event.notes ? (
                  <Text style={[styles.eventDesc, { color: colors.textMuted, fontSize: scaledFont(13) }]} numberOfLines={1}>
                    {event.notes}
                  </Text>
                ) : null}

                {/* Linked Programs */}
                {event.type === 'training' && (event as any).linkedPrograms?.length > 0 && (
                  <View style={styles.linkedProgramsRow}>
                    {((event as any).linkedPrograms as Array<{ programId: string; name: string; category?: string }>).map((lp) => (
                      <View key={lp.programId} style={[styles.linkedPill, { backgroundColor: colors.accent1 + '15', borderColor: colors.accent1 + '30' }]}>
                        <SmartIcon name="barbell-outline" size={10} color={colors.accent1} />
                        <Text style={[styles.linkedPillText, { color: colors.accent1 }]} numberOfLines={1}>{lp.name}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Bottom row: type badge + action buttons */}
                <View style={styles.bottomRow}>
                  <View style={[styles.typeBadge, { backgroundColor: eventColor + '20', borderColor: eventColor + '40' }]}>
                    <Text style={[styles.typeBadgeText, { color: eventColor }]}>
                      {TYPE_LABELS[event.type] || 'OTHER'}
                    </Text>
                  </View>

                  {/* Action buttons: Edit + Done/Skip */}
                  <View style={styles.actionRow}>
                    {onEventEdit && !isDone && (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); onEventEdit(event); }}
                        hitSlop={8}
                        style={styles.actionBtn}
                      >
                        <SmartIcon name="create-outline" size={18} color={colors.accent2} />
                      </Pressable>
                    )}
                    {!isDone && onEventComplete && (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); onEventComplete(event.id); }}
                        hitSlop={8}
                        style={styles.actionBtn}
                      >
                        <SmartIcon name="checkmark-circle-outline" size={18} color={colors.accent} />
                      </Pressable>
                    )}
                    {!isDone && onEventSkip && (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); onEventSkip(event.id); }}
                        hitSlop={8}
                        style={styles.actionBtn}
                      >
                        <SmartIcon name="close-circle-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>

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
  linkedProgramsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 2,
  },
  linkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkedPillText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    maxWidth: 120,
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
  journalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  journalBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
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
