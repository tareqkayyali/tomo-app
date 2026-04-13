/**
 * DayHighlights — Horizontal announcement strip for day-level highlights.
 *
 * Sits between the DayStrip date navigator and the scrollable timeline content.
 * Renders pill chips for exams (and future highlight types) on the selected day.
 * Returns null when there are no highlights — zero layout impact.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { spacing, layout, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import { formatTime12h } from '../../utils/calendarHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HighlightKind = 'exam' | 'match' | 'deadline';

export interface DayHighlight {
  id: string;
  kind: HighlightKind;
  label: string;
  time: string | null;
  color: string;
  iconName: string;
}

export interface DayHighlightsProps {
  highlights: DayHighlight[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DayHighlights({ highlights }: DayHighlightsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (highlights.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {highlights.map((h) => (
          <View
            key={h.id}
            style={[
              styles.pill,
              {
                backgroundColor: `${h.color}1F`,
                borderColor: `${h.color}4D`,
              },
            ]}
          >
            <SmartIcon name={h.iconName} size={14} color={h.color} />
            <Text
              style={[styles.pillLabel, { color: h.color }]}
              numberOfLines={1}
            >
              {h.label}
            </Text>
            {h.time && (
              <Text style={styles.pillTime}>
                {formatTime12h(h.time)}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: layout.screenMargin,
    },
    scrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.compact,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      maxWidth: 220,
    },
    pillLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      flexShrink: 1,
    },
    pillTime: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textSecondary,
    },
  });
}
