/**
 * ProgramPanel — Training Programs slide-up panel.
 *
 * Shows: Current program card, today's session exercises, this week calendar.
 * Data sourced from boot data + signal context.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SlideUpPanel } from './SlideUpPanel';
import { fontFamily } from '../../../theme/typography';

interface ProgramPanelProps {
  isOpen: boolean;
  onClose: () => void;
  adaptedPlan: { sessionName: string; sessionMeta: string } | null;
  activePrograms?: { programId: string; startedAt: string; metadata: Record<string, unknown> }[];
  signalColor: string;
}

export function ProgramPanel({ isOpen, onClose, adaptedPlan, activePrograms, signalColor }: ProgramPanelProps) {
  const programs = activePrograms ?? [];
  const hasPrograms = programs.length > 0;

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Training Programs"
      subtitle="Current program details"
    >
      {/* Active Programs */}
      {hasPrograms ? (
        programs.map((prog) => {
          const meta = prog.metadata as Record<string, any>;
          const programName = meta?.name ?? meta?.programName ?? 'Active Program';
          const category = meta?.category ?? meta?.trainingCategory ?? null;
          const weekNumber = meta?.currentWeek ?? meta?.weekNumber ?? null;
          const totalWeeks = meta?.totalWeeks ?? meta?.durationWeeks ?? null;
          const startDate = new Date(prog.startedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' });

          return (
            <View key={prog.programId} style={styles.sectionCard}>
              <Text style={styles.cardLabel}>ACTIVE PROGRAM</Text>
              <Text style={styles.sessionName}>{programName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {category && (
                  <View style={{ backgroundColor: signalColor + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: fontFamily.medium, fontSize: 8, color: signalColor, letterSpacing: 1, textTransform: 'uppercase' }}>{category}</Text>
                  </View>
                )}
                <Text style={styles.sessionMeta}>Started {startDate}</Text>
              </View>
              {weekNumber != null && totalWeeks != null && totalWeeks > 0 && (
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontFamily: fontFamily.medium, fontSize: 10, color: '#7A8D7E' }}>Week {weekNumber} of {totalWeeks}</Text>
                    <Text style={{ fontFamily: fontFamily.medium, fontSize: 10, color: '#7A8D7E' }}>{Math.round((weekNumber / totalWeeks) * 100)}%</Text>
                  </View>
                  <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: 3, width: `${Math.min((weekNumber / totalWeeks) * 100, 100)}%`, backgroundColor: signalColor, borderRadius: 2 }} />
                  </View>
                </View>
              )}
            </View>
          );
        })
      ) : (
        <View style={styles.sectionCard}>
          <Text style={styles.cardLabel}>NO ACTIVE PROGRAM</Text>
          <Text style={styles.placeholder}>
            You don't have an active training program yet. Browse available programs to get started with a structured plan.
          </Text>
        </View>
      )}

      {/* Today's Session */}
      {adaptedPlan && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardLabel}>TODAY'S SESSION</Text>
          <Text style={styles.sessionName}>{adaptedPlan.sessionName}</Text>
          <Text style={styles.sessionMeta}>{adaptedPlan.sessionMeta}</Text>
        </View>
      )}

      {/* This Week */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>THIS WEEK</Text>
        <View style={styles.weekRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const isToday = i === new Date().getDay() - 1; // 0=Mon
            return (
              <View key={i} style={styles.dayCell}>
                <Text style={[styles.dayLabel, isToday && { color: signalColor }]}>{day}</Text>
                <View style={[
                  styles.dayCircle,
                  isToday && { borderColor: signalColor, borderWidth: 1.5 },
                ]}>
                  {isToday && (
                    <View style={[styles.todayDot, { backgroundColor: signalColor }]} />
                  )}
                </View>
                {isToday && (
                  <Text style={[styles.daySubLabel, { color: signalColor }]}>now</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </SlideUpPanel>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sessionName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#E5EBE8',
    marginBottom: 3,
  },
  sessionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#7A8D7E',
  },
  placeholder: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#4A5E50',
    lineHeight: 18,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    width: 36,
  },
  dayLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: '#4A5E50',
    marginBottom: 4,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  daySubLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 7,
    marginTop: 2,
  },
});
