/**
 * ExamStudyPlanner — Exam countdown + study suggestion cards
 *
 * Shows when exams are within 14 days. Displays:
 * - Exam countdown cards with subject, date, days remaining
 * - AI-suggested study blocks with "Add to Calendar" CTA
 * - "Exam Mode" toggle to reduce training intensity
 *
 * Matches prototype Exam Study Planner section.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SmartIcon } from './SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';
import { colors } from '../theme/colors';

// Sage green accent for academic (ARC theme)
const ACADEMIC_PURPLE = colors.accent1;

export type UpcomingExam = {
  id: string;
  subject: string;
  examDate: string;        // ISO date
  daysUntil: number;
};

export type StudySuggestion = {
  id: string;
  subject: string;
  timeSlot: string;        // e.g., "3:00 PM - 4:00 PM"
  day: string;             // e.g., "Today", "Tomorrow", "Wed"
  priority: 'high' | 'medium' | 'low';
};

type ExamStudyPlannerProps = {
  exams: UpcomingExam[];
  suggestions?: StudySuggestion[];
  onAddStudyBlock?: (suggestion: StudySuggestion) => void;
};

export function ExamStudyPlanner({
  exams,
  suggestions = [],
  onAddStudyBlock,
}: ExamStudyPlannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (exams.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SmartIcon name="school" size={16} color={ACADEMIC_PURPLE} />
          <Text style={styles.headerTitle}>EXAM MODE</Text>
        </View>
        <View style={styles.examBadge}>
          <Text style={styles.examBadgeText}>
            {exams.length} exam{exams.length !== 1 ? 's' : ''} ahead
          </Text>
        </View>
      </View>

      {/* Exam countdown cards */}
      {exams.map((exam) => (
        <View key={exam.id} style={styles.examCard}>
          <LinearGradient
            colors={[`${ACADEMIC_PURPLE}15`, `${colors.accent1}10`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.examCardGradient}
          >
            <View style={styles.examRow}>
              <View style={styles.examInfo}>
                <Text style={styles.examSubject}>{exam.subject}</Text>
                <Text style={styles.examDate}>{exam.examDate}</Text>
              </View>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownNumber}>{exam.daysUntil}</Text>
                <Text style={styles.countdownLabel}>days</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      ))}

      {/* AI Study suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsSection}>
          <Text style={styles.suggestionsTitle}>
            Tomo suggests these study blocks:
          </Text>
          {suggestions.map((sug) => (
            <TouchableOpacity
              key={sug.id}
              style={styles.suggestionCard}
              onPress={() => onAddStudyBlock?.(sug)}
              activeOpacity={0.8}
            >
              <View style={styles.suggestionInfo}>
                <Text style={styles.suggestionSubject}>{sug.subject}</Text>
                <Text style={styles.suggestionTime}>
                  {sug.day} · {sug.timeSlot}
                </Text>
              </View>
              <View style={styles.addBtn}>
                <SmartIcon name="add-circle" size={24} color={ACADEMIC_PURPLE} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: ACADEMIC_PURPLE,
      letterSpacing: 1,
    },
    examBadge: {
      backgroundColor: `${ACADEMIC_PURPLE}20`,
      borderRadius: borderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    examBadgeText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: ACADEMIC_PURPLE,
    },
    examCard: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: `${ACADEMIC_PURPLE}30`,
    },
    examCardGradient: {
      padding: spacing.md,
    },
    examRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    examInfo: {
      flex: 1,
    },
    examSubject: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
      marginBottom: 4,
    },
    examDate: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    countdownCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${ACADEMIC_PURPLE}25`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countdownNumber: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: ACADEMIC_PURPLE,
      lineHeight: 22,
    },
    countdownLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 9,
      color: ACADEMIC_PURPLE,
    },
    suggestionsSection: {
      gap: spacing.xs,
    },
    suggestionsTitle: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      marginBottom: 4,
    },
    suggestionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    suggestionInfo: {
      flex: 1,
    },
    suggestionSubject: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
    },
    suggestionTime: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
    },
    addBtn: {
      padding: 4,
    },
  });
}
