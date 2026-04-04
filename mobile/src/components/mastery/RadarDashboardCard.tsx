/**
 * RadarDashboardCard — Analytics-style radar section.
 * Shows HexagonRadar at normal size with position badge, overall rating, and tier.
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HexagonRadar, type RadarAttribute } from '../HexagonRadar';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { CardTier } from '../../services/api';

interface RadarDashboardCardProps {
  attributes: RadarAttribute[];
  benchmarkAttributes?: RadarAttribute[];
  overallRating: number;
  position: string;
  cardTier: CardTier;
  onAttributeTap?: (key: string) => void;
}

const TIER_CONFIG: Record<CardTier, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  bronze: { label: 'Bronze', icon: 'shield' },
  silver: { label: 'Silver', icon: 'shield' },
  gold: { label: 'Gold', icon: 'star' },
  diamond: { label: 'Diamond', icon: 'diamond' },
};

const RadarDashboardCard: React.FC<RadarDashboardCardProps> = memo(({
  attributes,
  benchmarkAttributes,
  overallRating,
  position,
  cardTier,
  onAttributeTap,
}) => {
  const { colors } = useTheme();
  const tier = TIER_CONFIG[cardTier];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Top row: Position + Rating */}
      <View style={styles.topRow}>
        <View style={[styles.positionBadge, { backgroundColor: `${colors.accent}20`, borderColor: `${colors.accent}40` }]}>
          <Text style={[styles.positionText, { color: colors.accent }]}>{position}</Text>
        </View>
        <Text style={[styles.rating, { color: colors.textPrimary }]}>{overallRating}</Text>
      </View>

      {/* Radar chart */}
      <View style={styles.radarWrap}>
        <HexagonRadar
          attributes={attributes}
          benchmarkAttributes={benchmarkAttributes}
          size={220}
          animate
          onAttributeTap={onAttributeTap}
        />
      </View>

      {/* Tier badge */}
      <View style={styles.tierRow}>
        <View style={[styles.tierBadge, { backgroundColor: `${colors.accent}14` }]}>
          <Ionicons name={tier.icon} size={14} color={colors.accent} />
          <Text style={[styles.tierText, { color: colors.accent }]}>{tier.label}</Text>
        </View>
      </View>
    </View>
  );
});

RadarDashboardCard.displayName = 'RadarDashboardCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  positionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  positionText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  rating: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    letterSpacing: -0.72,
  },
  radarWrap: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  tierRow: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  tierText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
});

export { RadarDashboardCard };
