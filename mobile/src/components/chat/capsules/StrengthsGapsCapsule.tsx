/**
 * StrengthsGapsCapsule — Show player's strengths and gaps inline in chat.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { StrengthsGapsCapsule as StrengthsGapsCapsuleType } from '../../../types/chat';

interface Props {
  card: StrengthsGapsCapsuleType;
}

export function StrengthsGapsCapsuleComponent({ card }: Props) {
  const overallPercentile = typeof card.overallPercentile === 'number' ? card.overallPercentile : 0;
  const strengths = card.strengths ?? [];
  const gaps = card.gaps ?? [];
  const totalMetrics = typeof card.totalMetrics === 'number' ? card.totalMetrics : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Performance Profile</Text>

      {/* Overall */}
      <View style={styles.overallRow}>
        <Text style={styles.overallLabel}>Overall Percentile</Text>
        <Text style={[styles.overallValue, { color: overallPercentile >= 60 ? colors.success : overallPercentile >= 40 ? colors.warning : colors.textSecondary }]}>
          P{Math.round(overallPercentile)}
        </Text>
      </View>

      {/* Strengths */}
      {strengths.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strengths</Text>
          {strengths.map((s, i) => (
            <View key={i} style={styles.metricRow}>
              <Text style={styles.metricName}>{s.metric}</Text>
              <Text style={styles.metricValue}>{s.value} {s.unit}</Text>
              <Text style={[styles.percentile, { color: colors.success }]}>P{s.percentile}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Areas to Develop</Text>
          {gaps.map((g, i) => (
            <View key={i} style={styles.metricRow}>
              <Text style={styles.metricName}>{g.metric}</Text>
              <Text style={styles.metricValue}>{g.value} {g.unit}</Text>
              <Text style={[styles.percentile, { color: colors.textSecondary }]}>P{g.percentile}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footer}>{totalMetrics} metrics tracked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm },
  overallLabel: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textSecondary },
  overallValue: { fontFamily: fontFamily.bold, fontSize: 24 },
  section: { gap: 4 },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.textInactive, marginTop: 4 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 3 },
  metricName: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textPrimary, flex: 1 },
  metricValue: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary, width: 70, textAlign: 'right' },
  percentile: { fontFamily: fontFamily.bold, fontSize: 13, width: 35, textAlign: 'right' },
  footer: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textInactive, textAlign: 'center' },
});
