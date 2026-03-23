/**
 * EventCard — Reusable calendar event card with type color indicator
 * Supports swipe-to-delete and tap to expand details.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontFamily } from '../../theme';
import { getEventTypeColor, getSportDotColor, getSportLabel } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';

interface LinkedProgramInfo {
  programId: string;
  name: string;
  category: string;
}

interface Props {
  event: CalendarEvent;
  onDelete?: (eventId: string) => Promise<boolean> | void;
  compact?: boolean;
  linkedPrograms?: LinkedProgramInfo[];
}

export function EventCard({ event, onDelete, compact = false, linkedPrograms = [] }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const typeColor = getEventTypeColor(event.type);
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);

  const executeDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      const result = await onDelete(event.id);
      if (result === false) {
        // API failed — reverse the animation
        console.warn('[EventCard] delete failed, reverting animation');
        opacity.value = withTiming(1, { duration: 200 });
        translateX.value = withTiming(0, { duration: 200 });
        if (Platform.OS === 'web') {
          window.alert('Could not delete event. Please try again.');
        } else {
          Alert.alert('Delete Failed', 'Could not delete event. Please try again.');
        }
      }
    } catch {
      // Also reverse on error
      opacity.value = withTiming(1, { duration: 200 });
      translateX.value = withTiming(0, { duration: 200 });
      if (Platform.OS === 'web') {
        window.alert('Could not delete event. Please try again.');
      } else {
        Alert.alert('Delete Failed', 'Could not delete event. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  }, [event.id, onDelete, opacity, translateX]);

  const handleDelete = useCallback(() => {
    if (deleting) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${event.name}"?`)) {
        opacity.value = withTiming(0, { duration: 250 });
        translateX.value = withTiming(-300, { duration: 250 }, () => {
          runOnJS(executeDelete)();
        });
      }
      return;
    }
    Alert.alert('Delete Event', `Remove "${event.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          opacity.value = withTiming(0, { duration: 250 });
          translateX.value = withTiming(-300, { duration: 250 }, () => {
            runOnJS(executeDelete)();
          });
        },
      },
    ]);
  }, [event, deleting, executeDelete, opacity, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  if (compact) {
    return (
      <Animated.View style={[styles.compactCard, animatedStyle]}>
        <View style={[styles.colorStrip, { backgroundColor: typeColor }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactName} numberOfLines={1}>
            {event.name}
          </Text>
          {event.startTime && (
            <Text style={styles.compactTime}>{event.startTime}</Text>
          )}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => setExpanded((p) => !p)}
        onLongPress={onDelete ? handleDelete : undefined}
        style={styles.card}
      >
        <View style={[styles.colorBar, { backgroundColor: typeColor }]} />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>{event.name}</Text>
            {event.sport && event.sport !== 'general' && (
              <View style={[styles.sportBadge, { backgroundColor: getSportDotColor(event.sport) + '20' }]}>
                <View style={[styles.sportDot, { backgroundColor: getSportDotColor(event.sport) }]} />
                <Text style={[styles.sportBadgeText, { color: getSportDotColor(event.sport) }]}>
                  {getSportLabel(event.sport)}
                </Text>
              </View>
            )}
            {event.intensity && (
              <View style={[styles.intensityBadge, { backgroundColor: typeColor + '20' }]}>
                <Text style={[styles.intensityText, { color: typeColor }]}>
                  {event.intensity}
                </Text>
              </View>
            )}
          </View>

          {event.startTime && (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={13} color={colors.textInactive} />
              <Text style={styles.timeText}>
                {event.startTime}
                {event.endTime ? ` – ${event.endTime}` : ''}
              </Text>
            </View>
          )}

          {expanded && event.notes ? (
            <Text style={styles.notes}>{event.notes}</Text>
          ) : null}

          {/* Linked programs from training categories */}
          {linkedPrograms.length > 0 && (
            <View style={styles.linkedProgramsRow}>
              <Ionicons name="barbell-outline" size={12} color={colors.accent2} />
              <Text style={styles.linkedProgramsText} numberOfLines={expanded ? undefined : 1}>
                {linkedPrograms.map((lp) => lp.name).join(', ')}
              </Text>
            </View>
          )}

          {expanded && onDelete && (
            <Pressable onPress={handleDelete} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  colorBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.compact,
    paddingLeft: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textOnDark,
    flex: 1,
  },
  sportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: spacing.sm,
  },
  sportDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sportBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  intensityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: spacing.sm,
  },
  intensityText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
  },
  notes: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  linkedProgramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  linkedProgramsText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.info,
    flex: 1,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  deleteText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.error,
  },

  // Compact variant (for week grid mini-cards)
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: 6,
    marginBottom: 3,
    overflow: 'hidden',
  },
  colorStrip: {
    width: 3,
    alignSelf: 'stretch',
  },
  compactContent: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  compactName: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textOnDark,
  },
  compactTime: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: colors.textInactive,
  },
});
