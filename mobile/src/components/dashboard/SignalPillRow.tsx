/**
 * SignalPillRow — 2–3 metric pills in the hero section.
 *
 * Each pill shows a label (e.g. "HRV +10%") and sub-label ("above baseline").
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';

interface Pill {
  label: string;
  subLabel: string;
}

interface SignalPillRowProps {
  pills: Pill[];
  pillBackground: string;
  signalColor: string;
}

export function SignalPillRow({ pills, pillBackground, signalColor }: SignalPillRowProps) {
  if (!Array.isArray(pills) || pills.length === 0) return null;

  return (
    <View style={styles.row}>
      {pills.map((pill, i) => (
        <View key={i} style={[styles.pill, { backgroundColor: pillBackground }]}>
          <Text style={[styles.label, { color: signalColor }]}>{pill.label}</Text>
          <Text style={styles.subLabel}>{pill.subLabel}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 8,
    letterSpacing: 1,
  },
  subLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 8,
    color: 'rgba(255,255,255,0.28)',
  },
});
