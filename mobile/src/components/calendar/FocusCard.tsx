/**
 * FocusCard — "Today's Focus" card for the calendar Focus view.
 *
 * Shows up to 3 focus items with staggered fade-in, or an empty state
 * prompting the user to add an event.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';
import { fontFamily } from '../../theme/typography';
import { GlassCard } from '../GlassCard';
import { PlanningStreakBadge } from './PlanningStreakBadge';
import { getEventTypeColor } from '../../utils/calendarHelpers';
import type { ThemeColors } from '../../theme/colors';
import type { FocusItem } from '../../types';

// ─── Props ─────────────────────────────────────────────────────────────────

interface FocusCardProps {
  focusItems: FocusItem[];
  planningStreak: number;
  onSeeFullCalendar: () => void;
  onAddEvent: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FocusCard({
  focusItems,
  planningStreak,
  onSeeFullCalendar,
  onAddEvent,
}: FocusCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const displayItems = focusItems.slice(0, 3);
  const isEmpty = displayItems.length === 0;

  return (
    <GlassCard>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.heading}>Today's Focus</Text>
        <PlanningStreakBadge streak={planningStreak} />
      </View>

      {/* ── Items or Empty State ──────────────────────────────────────── */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="calendar-outline"
            size={48}
            color={colors.textMuted}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyHeading}>No plans yet</Text>
          <Text style={styles.emptySubtitle}>
            Add something to your day
          </Text>

          <Pressable onPress={onAddEvent} style={styles.addButton}>
            <LinearGradient
              colors={colors.gradientOrangeCyan}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addButtonGradient}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Event</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <View style={styles.itemsContainer}>
          {displayItems.map((item, index) => {
            const dotColor =
              item.type === 'plan'
                ? colors.accent1
                : getEventTypeColor(item.type);

            return (
              <Animated.View
                key={item.id}
                entering={FadeIn.delay(index * 100).duration(350)}
                style={styles.itemRow}
              >
                {/* Color dot */}
                <View style={[styles.dot, { backgroundColor: dotColor }]} />

                {/* Title + subtitle */}
                <View style={styles.itemCenter}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>

                {/* Time */}
                {item.time ? (
                  <Text style={styles.itemTime}>{item.time}</Text>
                ) : null}
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* ── Footer link ──────────────────────────────────────────────── */}
      <Pressable onPress={onSeeFullCalendar} style={styles.footerLink}>
        <Text style={styles.footerText}>See Full Calendar</Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.accent2}
        />
      </Pressable>
    </GlassCard>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    heading: {
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      color: colors.textHeader,
    },

    // Items
    itemsContainer: {
      gap: spacing.compact,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.compact,
    },
    itemCenter: {
      flex: 1,
      marginRight: spacing.sm,
    },
    itemTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textHeader,
    },
    itemSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 2,
    },
    itemTime: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
    },

    // Empty State
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
    },
    emptyIcon: {
      marginBottom: spacing.md,
    },
    emptyHeading: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textHeader,
      marginBottom: spacing.xs,
    },
    emptySubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    addButton: {
      borderRadius: borderRadius.md,
      overflow: 'hidden',
    },
    addButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.compact,
      borderRadius: borderRadius.md,
      gap: spacing.xs,
    },
    addButtonText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: '#FFFFFF',
    },

    // Footer
    footerLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
      paddingTop: spacing.compact,
    },
    footerText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.accent2,
      marginRight: spacing.xs,
    },
  });
}
