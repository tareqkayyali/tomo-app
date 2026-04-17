/**
 * GrowthCardSection — PHV growth tracking card.
 *
 * Config:
 *   show_predicted_height: boolean
 *   show_growth_velocity: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius, spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const PHV_STAGE_LABELS: Record<string, { label: string; color: string }> = {
  pre: { label: 'Pre-PHV', color: '#7a9b76' },
  mid: { label: 'Mid-PHV', color: '#A05A4A' },
  post: { label: 'Post-PHV', color: '#5A8A9F' },
  none: { label: 'Not Set', color: '#666' },
};

export const GrowthCardSection = memo(function GrowthCardSection({
  config,
  coachingText,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const showPredicted = (config.show_predicted_height as boolean) ?? true;
  const showVelocity = (config.show_growth_velocity as boolean) ?? true;

  const snapshot = bootData.snapshot ?? {};
  const rawStage = (snapshot.phv_stage as string) ?? 'none';
  const stage = rawStage.toLowerCase();
  const stageConfig = PHV_STAGE_LABELS[stage] ?? PHV_STAGE_LABELS.none;
  const predictedHeight = snapshot.predicted_adult_height as number | undefined;
  const growthVelocity = snapshot.growth_velocity_cm_year as number | undefined;

  if (stage === 'none') return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: stageConfig.color }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.chalk }]}>Growth Tracking</Text>
        <Text style={[styles.stageBadge, { color: stageConfig.color }]}>
          {stageConfig.label}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        {showPredicted && predictedHeight && (
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.chalk }]}>
              {predictedHeight.toFixed(1)} cm
            </Text>
            <Text style={[styles.metricLabel, { color: colors.chalkDim }]}>
              Predicted Height
            </Text>
          </View>
        )}
        {showVelocity && growthVelocity !== undefined && (
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.chalk }]}>
              {growthVelocity.toFixed(1)} cm/yr
            </Text>
            <Text style={[styles.metricLabel, { color: colors.chalkDim }]}>
              Growth Velocity
            </Text>
          </View>
        )}
      </View>

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
    borderLeftWidth: 3,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  stageBadge: {
    fontFamily: fontFamily.display,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontFamily: fontFamily.display,
    fontSize: 18,
  },
  metricLabel: {
    fontFamily: fontFamily.note,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  coaching: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
});
