/**
 * ConflictResolutionCapsule — Shows schedule conflicts with resolution actions.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ConflictResolutionCapsule as ConflictResolutionCapsuleType } from '../../../types/chat';

interface Props {
  card: ConflictResolutionCapsuleType;
  onAction: (message: string) => void;
}

export function ConflictResolutionCapsuleComponent({ card, onAction }: Props) {
  const conflicts = Array.isArray(card.conflicts) ? card.conflicts : [];
  const daysChecked = card.daysChecked ?? 7;
  const totalEvents = card.totalEvents ?? 0;

  if (conflicts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>No conflicts found</Text>
        <Text style={styles.subtext}>
          Your schedule looks clean for the next {daysChecked} days ({totalEvents} events checked).
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Found</Text>
      <Text style={styles.subtext}>
        Checked {totalEvents} events over {daysChecked} days
      </Text>

      {conflicts.map((conflict, i) => {
        const events = Array.isArray(conflict.events) ? conflict.events : [];
        const suggestions = Array.isArray(conflict.suggestions) ? conflict.suggestions : [];
        return (
          <View key={i} style={[styles.conflictCard, conflict.severity === 'danger' ? styles.dangerBorder : styles.warningBorder]}>
            <View style={styles.conflictHeader}>
              <Text style={styles.conflictDate}>{formatDate(conflict.date)}</Text>
              <View style={[styles.severityBadge, conflict.severity === 'danger' ? styles.dangerBadge : styles.warningBadge]}>
                <Text style={styles.severityText}>
                  {conflict.severity === 'danger' ? 'High Risk' : 'Watch'}
                </Text>
              </View>
            </View>

            <Text style={styles.issueText}>{conflict.issue}</Text>

            <View style={styles.eventList}>
              {events.map((event, j) => (
                <View key={j} style={styles.eventRow}>
                  <Text style={styles.eventTime}>{event.localStart}–{event.localEnd}</Text>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {event.intensity && (
                    <Text style={[styles.intensityBadge, event.intensity === 'HARD' ? styles.hardIntensity : styles.modIntensity]}>
                      {event.intensity}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.suggestionsRow}>
              {suggestions.map((suggestion, k) => (
                <Pressable
                  key={k}
                  onPress={() => onAction(suggestion.action)}
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.suggestionText}>{suggestion.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  conflictCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    borderLeftWidth: 3,
  },
  dangerBorder: { borderLeftColor: colors.textSecondary },
  warningBorder: { borderLeftColor: colors.warning },
  conflictHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conflictDate: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  dangerBadge: { backgroundColor: colors.secondarySubtle },
  warningBadge: { backgroundColor: colors.secondarySubtle },
  severityText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textPrimary,
  },
  issueText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  eventList: { gap: 4 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eventTime: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.accent2,
    width: 90,
  },
  eventTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  intensityBadge: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  hardIntensity: { backgroundColor: colors.secondaryMuted, color: colors.textSecondary },
  modIntensity: { backgroundColor: colors.secondaryMuted, color: colors.warning },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  suggestionChip: {
    backgroundColor: colors.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent1,
  },
  chipPressed: { opacity: 0.7 },
  suggestionText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.accent1,
  },
});
