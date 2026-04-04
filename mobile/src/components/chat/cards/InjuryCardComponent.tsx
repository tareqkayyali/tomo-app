/**
 * InjuryCard — Displays a logged injury with severity, location, and recovery tip.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { InjuryCard } from '../../../types/chat';

interface InjuryCardProps {
  card: InjuryCard;
}

const SEVERITY_COLORS = {
  1: colors.readinessGreen ?? '#30D158',
  2: colors.readinessYellow ?? '#F39C12',
  3: colors.readinessRed ?? '#E74C3C',
};

const SEVERITY_ICONS = {
  1: '🟡',
  2: '🟠',
  3: '🔴',
};

export function InjuryCardComponent({ card }: InjuryCardProps) {
  const severityColor = SEVERITY_COLORS[card.severity];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{SEVERITY_ICONS[card.severity]}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>Injury logged — {card.location}</Text>
          <Text style={[styles.severity, { color: severityColor }]}>
            {card.severityLabel}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.statusText}>Added to your injury history</Text>
      </View>

      {card.autoAdjustedSession && (
        <View style={styles.statusRow}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.statusText}>Today's session adjusted</Text>
        </View>
      )}

      {card.recoveryTip && (
        <View style={styles.tipContainer}>
          <Text style={styles.tipText}>{card.recoveryTip}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  severity: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  checkmark: {
    fontSize: 14,
    color: colors.accent2 ?? '#00D9FF',
  },
  statusText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  tipContainer: {
    backgroundColor: (colors as any).backgroundTertiary ?? '#252328',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  tipText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
});
