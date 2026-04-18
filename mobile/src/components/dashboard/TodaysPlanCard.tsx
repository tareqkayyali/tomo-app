/**
 * TodaysPlanCard — Adapted session card for today.
 *
 * Shows the training session adapted by the active signal.
 * Icon container tint changes based on signal color family.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { fontFamily } from '../../theme/typography';

interface TodaysPlanCardProps {
  sessionName: string;
  sessionMeta: string;
  signalColor: string;
  exercises?: { name: string; sets: number; reps: string }[];
  weekNumber?: number;
  totalWeeks?: number;
  adaptationNotes?: string[];
}

function ProgramGridIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20}>
      <Rect x={3} y={3} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={13} y={3} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={3} y={13} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1={17} y1={15} x2={17} y2={19} stroke={color} strokeWidth={1.5} />
      <Line x1={15} y1={17} x2={19} y2={17} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function TodaysPlanCard({ sessionName, sessionMeta, signalColor, exercises, weekNumber, totalWeeks, adaptationNotes }: TodaysPlanCardProps) {
  const showExercises = exercises && exercises.length > 0;
  const showWeekProgress = weekNumber != null && totalWeeks != null && totalWeeks > 0;
  const showAdaptation = adaptationNotes && adaptationNotes.length > 0;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.iconContainer, { backgroundColor: `${signalColor}1A` }]}>
          <ProgramGridIcon color={signalColor} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.sessionName}>{sessionName}</Text>
          <Text style={styles.sessionMeta}>{sessionMeta}</Text>
        </View>
      </View>

      {/* Exercise Preview */}
      {showExercises && (
        <View style={styles.exerciseSection}>
          {exercises!.slice(0, 3).map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseSets}>{ex.sets} x {ex.reps}</Text>
            </View>
          ))}
          {exercises!.length > 3 && (
            <Text style={styles.moreExercises}>+{exercises!.length - 3} more</Text>
          )}
        </View>
      )}

      {/* Week Progress Bar */}
      {showWeekProgress && (
        <View style={styles.weekProgressSection}>
          <View style={styles.weekProgressHeader}>
            <Text style={styles.weekLabel}>Week {weekNumber} of {totalWeeks}</Text>
            <Text style={styles.weekPercent}>{Math.round((weekNumber! / totalWeeks!) * 100)}%</Text>
          </View>
          <View style={styles.weekBarTrack}>
            <View style={[styles.weekBarFill, { width: `${Math.min((weekNumber! / totalWeeks!) * 100, 100)}%`, backgroundColor: signalColor }]} />
          </View>
        </View>
      )}

      {/* Adaptation Notes */}
      {showAdaptation && (
        <View style={styles.adaptationSection}>
          {adaptationNotes!.map((note, i) => (
            <View key={i} style={styles.adaptationRow}>
              <View style={styles.adaptationDot} />
              <Text style={styles.adaptationText}>{note}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
  },
  sessionName: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#F5F3ED',
    marginBottom: 2,
  },
  sessionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.5)',
  },
  // Exercise preview
  exerciseSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,243,237,0.05)',
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  exerciseName: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#F5F3ED',
  },
  exerciseSets: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.5)',
  },
  moreExercises: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.3)',
    marginTop: 4,
  },
  // Week progress
  weekProgressSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,243,237,0.05)',
  },
  weekProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  weekLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(245,243,237,0.5)',
  },
  weekPercent: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(245,243,237,0.5)',
  },
  weekBarTrack: {
    height: 3,
    backgroundColor: 'rgba(245,243,237,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  weekBarFill: {
    height: 3,
    borderRadius: 2,
  },
  // Adaptation notes
  adaptationSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,243,237,0.05)',
    backgroundColor: 'rgba(196,154,60,0.06)',
    borderRadius: 8,
    padding: 10,
  },
  adaptationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 3,
  },
  adaptationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c49a3c',
    marginTop: 4,
  },
  adaptationText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: '#c49a3c',
    lineHeight: 14,
    flex: 1,
  },
});
