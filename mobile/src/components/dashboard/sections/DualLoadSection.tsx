/**
 * DualLoadSection — Academic + Athletic dual load gauge.
 *
 * Config:
 *   show_exam_countdown: boolean
 *   show_study_hours: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

export const DualLoadSection = memo(function DualLoadSection({
  config,
  coachingText,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const showExam = (config.show_exam_countdown as boolean) ?? true;
  const snapshot = bootData.snapshot ?? {};

  const dli = typeof snapshot.dual_load_index === 'number' ? snapshot.dual_load_index : 0;
  const exams = bootData.upcomingExams ?? [];
  const nextExam = exams.length > 0 ? exams[0] : null;

  // Color based on DLI zone
  const barColor = dli >= 70 ? '#A05A4A' : dli >= 40 ? '#c49a3c' : '#7a9b76';
  const barPct = Math.min(dli, 100);

  if (dli === 0 && exams.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.chalk }]}>Dual Load Index</Text>

      {/* Bar gauge */}
      <View style={styles.barRow}>
        <View style={[styles.barTrack, { backgroundColor: colors.chalkGhost }]}>
          <View style={[styles.barFill, { width: `${barPct}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.pctText, { color: barColor }]}>{dli}%</Text>
      </View>

      {/* Exam countdown */}
      {showExam && nextExam && (
        <View style={styles.examRow}>
          <Text style={[styles.examLabel, { color: colors.chalkDim }]}>Next Exam</Text>
          <Text style={[styles.examValue, { color: colors.chalk }]}>
            {nextExam.title}
          </Text>
          <Text style={[styles.examDate, { color: barColor }]}>
            {new Date(nextExam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      )}

      {coachingText ? (
        <Text style={[styles.coaching, { color: colors.chalkDim }]}>{coachingText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  pctText: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    minWidth: 40,
    textAlign: 'right',
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  examLabel: {
    fontFamily: fontFamily.note,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  examValue: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  examDate: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  coaching: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
});
