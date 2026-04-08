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
  signalColor: string;
}

export function ProgramPanel({ isOpen, onClose, adaptedPlan, signalColor }: ProgramPanelProps) {
  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Training Programs"
      subtitle="Current program details"
    >
      {/* Today's Session */}
      {adaptedPlan && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardLabel}>TODAY'S SESSION</Text>
          <Text style={styles.sessionName}>{adaptedPlan.sessionName}</Text>
          <Text style={styles.sessionMeta}>{adaptedPlan.sessionMeta}</Text>
        </View>
      )}

      {/* Placeholder for exercise rows — Phase 5 will wire real data */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>EXERCISES</Text>
        <Text style={styles.placeholder}>
          Exercise details will appear here when connected to your active program.
        </Text>
      </View>

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
