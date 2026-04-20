/**
 * PHVBanner — Compact single-row banner for Output screen
 *
 * State A: PHV exists — shows offset value + LTAD stage badge
 * State B: No PHV — tappable row to navigate to PHV calculator
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { colors } from '../../theme/colors';

interface PHVBannerProps {
  phvOffset: number | null;
  phvStage: string | null;
  ltadStage?: string | null;
  onCalculatePress: () => void;
}

/** Map PHV stage to a readable short label */
function stageLabel(stage: string | null): string {
  if (!stage) return '';
  switch (stage) {
    case 'pre-phv-early':
    case 'pre-phv-approaching':
      return 'Pre-PHV';
    case 'at-phv':
      return 'At PHV';
    case 'post-phv-recent':
      return 'Post-PHV';
    case 'post-phv-stable':
      return 'Post-PHV';
    default:
      return stage;
  }
}

/** Color for offset value based on stage */
function offsetColor(stage: string | null): string {
  if (!stage) return colors.muted;
  if (stage === 'at-phv') return colors.accent;
  if (stage.startsWith('post-phv')) return colors.accent;
  return colors.info;
}

export function PHVBanner({ phvOffset, phvStage, ltadStage, onCalculatePress }: PHVBannerProps) {
  const { colors } = useTheme();

  // State B — No PHV data
  if (phvOffset == null || !phvStage) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onCalculatePress}>
        <GlassCard
          style={styles.container}
          noPadding
        >
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.tomoCream }]}>
              Growth Stage
            </Text>
            <Text style={[styles.ctaText, { color: colors.tomoSage }]}>
              Calculate My PHV &rarr;
            </Text>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  }

  // State A — PHV exists
  const color = offsetColor(phvStage);
  const label = stageLabel(phvStage);

  return (
    <GlassCard style={styles.container} noPadding>
      <View style={styles.row}>
        <SmartIcon name="resize-outline" size={16} color={colors.tomoCream} style={{ marginRight: spacing.xs }} />
        <Text style={[styles.offsetValue, { color: colors.tomoCream }]}>
          {phvOffset > 0 ? '+' : ''}{phvOffset} yrs
        </Text>
        <View style={[styles.badge, { backgroundColor: colors.cream10 }]}>
          <Text style={[styles.badgeText, { color: colors.tomoCream }]}>{ltadStage || label}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onCalculatePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View style={styles.recalcRow}>
            <SmartIcon name="refresh-outline" size={14} color={colors.tomoCream} />
            <Text style={[styles.recalcText, { color: colors.tomoCream }]}>Recalculate</Text>
          </View>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.compact,
    height: 44,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  offsetValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    marginRight: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.compact,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  ctaText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  emoji: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  recalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recalcText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
});
