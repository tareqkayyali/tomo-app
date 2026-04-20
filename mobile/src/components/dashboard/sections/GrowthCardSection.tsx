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
import { spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const PHV_STAGE_LABELS: Record<string, { label: string; color: string }> = {
  pre: { label: 'Pre-PHV', color: '#7A9B76' },
  mid: { label: 'Mid-PHV', color: '#C8A27A' },
  post: { label: 'Post-PHV', color: '#8A9BB0' },
  none: { label: 'Not Set', color: '#7A8A9A' },
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
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.tomoCream }]}>Growth Tracking</Text>
        <Text style={[styles.stageBadge, { color: stageConfig.color }]}>
          {stageConfig.label}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        {showPredicted && predictedHeight && (
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.tomoCream }]}>
              {predictedHeight.toFixed(1)} cm
            </Text>
            <Text style={[styles.metricLabel, { color: colors.muted }]}>
              Predicted Height
            </Text>
          </View>
        )}
        {showVelocity && growthVelocity !== undefined && (
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.tomoCream }]}>
              {growthVelocity.toFixed(1)} cm/yr
            </Text>
            <Text style={[styles.metricLabel, { color: colors.muted }]}>
              Growth Velocity
            </Text>
          </View>
        )}
      </View>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  stageBadge: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
  },
  metricLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  coaching: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
});
