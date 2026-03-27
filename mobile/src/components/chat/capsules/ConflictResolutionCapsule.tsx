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
  if (card.conflicts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>✅ No conflicts found</Text>
        <Text style={styles.subtext}>
          Your schedule looks clean for the next {card.daysChecked} days ({card.totalEvents} events checked).
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>⚠️ {card.conflicts.length} Conflict{card.conflicts.length > 1 ? 's' : ''} Found</Text>
      <Text style={styles.subtext}>
        Checked {card.totalEvents} events over {card.daysChecked} days
      </Text>

      {card.conflicts.map((conflict, i) => (
        <View key={i} style={[styles.conflictCard, conflict.severity === 'danger' ? styles.dangerBorder : styles.warningBorder]}>
          {/* Date + severity */}
          <View style={styles.conflictHeader}>
            <Text style={styles.conflictDate}>{formatDate(conflict.date)}</Text>
            <View style={[styles.severityBadge, conflict.severity === 'danger' ? styles.dangerBadge : styles.warningBadge]}>
              <Text style={styles.severityText}>
                {conflict.severity === 'danger' ? '🔴 High Risk' : '🟡 Watch'}
              </Text>
            </View>
          </View>

          {/* Issue description */}
          <Text style={styles.issueText}>{conflict.issue}</Text>

          {/* Clashing events */}
          <View style={styles.eventList}>
            {conflict.events.map((event, j) => (
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

          {/* Resolution suggestions */}
          <View style={styles.suggestionsRow}>
            {conflict.suggestions.map((suggestion, k) => (
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
      ))}
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
  dangerBorder: { borderLeftColor: '#E74C3C' },
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
  dangerBadge: { backgroundColor: 'rgba(231, 76, 60, 0.15)' },
  warningBadge: { backgroundColor: 'rgba(243, 156, 18, 0.15)' },
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
  hardIntensity: { backgroundColor: 'rgba(231, 76, 60, 0.2)', color: '#E74C3C' },
  modIntensity: { backgroundColor: 'rgba(243, 156, 18, 0.2)', color: colors.warning },
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
