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
import type { SectionProps } from './DashboardSectionRenderer';

const GOOD = '#7A9B76';
const WARN = '#C8A27A';
const BAD = '#B08A7A';

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

  // Color based on DLI zone (overload = clay, borderline = amber, good = sage)
  const barColor = dli >= 70 ? BAD : dli >= 40 ? WARN : GOOD;
  const barPct = Math.min(dli, 100);

  if (dli === 0 && exams.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <Text style={[styles.title, { color: colors.tomoCream }]}>Dual Load Index</Text>

      {/* Bar gauge */}
      <View style={styles.barRow}>
        <View style={[styles.barTrack, { backgroundColor: colors.cream10 }]}>
          <View style={[styles.barFill, { width: `${barPct}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.pctText, { color: barColor }]}>{dli}%</Text>
      </View>

      {/* Exam countdown */}
      {showExam && nextExam && (
        <View style={styles.examRow}>
          <Text style={[styles.examLabel, { color: colors.muted }]}>Next Exam</Text>
          <Text style={[styles.examValue, { color: colors.tomoCream }]}>
            {nextExam.title}
          </Text>
          <Text style={[styles.examDate, { color: barColor }]}>
            {new Date(nextExam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      )}

      {coachingText ? (
        <Text style={[styles.coaching, { color: colors.muted }]}>{coachingText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
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
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    minWidth: 44,
    textAlign: 'right',
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  examLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  examValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    flex: 1,
  },
  examDate: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  coaching: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
});
