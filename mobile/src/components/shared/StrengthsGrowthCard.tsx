/**
 * StrengthsGrowthCard — Reusable chip display for player strengths and growth areas.
 * Used in both Mastery and Own It pages.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from '../GlassCard';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface Props {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGrowthCard({ strengths, gaps }: Props) {
  const { colors } = useTheme();

  if (strengths.length === 0 && gaps.length === 0) return null;

  return (
    <GlassCard>
      <Text style={[styles.title, { color: colors.textOnDark }]}>
        Strengths & Growth Areas
      </Text>
      <View style={styles.chipColumns}>
        {strengths.length > 0 && (
          <View style={styles.chipColumn}>
            <Text style={[styles.chipColumnLabel, { color: colors.accent }]}>
              Strengths
            </Text>
            <View style={styles.chipWrap}>
              {strengths.map((s) => (
                <Badge key={s} label={s} variant="success" size="small" />
              ))}
            </View>
          </View>
        )}
        {gaps.length > 0 && (
          <View style={styles.chipColumn}>
            <Text style={[styles.chipColumnLabel, { color: colors.warning }]}>
              Growth Areas
            </Text>
            <View style={styles.chipWrap}>
              {gaps.map((g) => (
                <Badge key={g} label={g} variant="warning" size="small" />
              ))}
            </View>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.36,
    marginBottom: spacing.md,
  },
  chipColumns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  chipColumn: {
    flex: 1,
  },
  chipColumnLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
