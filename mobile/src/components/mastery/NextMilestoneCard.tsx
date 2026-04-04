/**
 * NextMilestoneCard — Shows progress toward the next achievement/milestone.
 * Uses ProgressRing (64px) with milestone name and remaining count.
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import ProgressRing from '../tomo-ui/ProgressRing';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { NextMilestone } from '../../services/api';

interface NextMilestoneCardProps {
  milestone: NextMilestone;
}

const TYPE_LABELS: Record<string, string> = {
  streak: 'days',
  tests: 'tests',
  points: 'points',
};

const NextMilestoneCard: React.FC<NextMilestoneCardProps> = memo(({ milestone }) => {
  const { colors } = useTheme();
  const progressPct = Math.round(milestone.progress * 100);
  const remaining = Math.ceil(milestone.target * (1 - milestone.progress));
  const almostThere = milestone.progress >= 0.8;
  const unitLabel = TYPE_LABELS[milestone.type] ?? '';

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.surface,
        borderColor: almostThere ? `${colors.accent}40` : colors.border,
      },
    ]}>
      <ProgressRing
        progress={progressPct}
        size={64}
        strokeWidth={3}
        showPercentage
        ringColor={almostThere ? colors.accent : undefined}
      />

      <View style={styles.textCol}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>
          {milestone.name}
        </Text>
        <Text style={[styles.remaining, { color: colors.textSecondary }]}>
          {remaining} more {unitLabel} to unlock
        </Text>
        {almostThere && (
          <Text style={[styles.motivate, { color: colors.accent }]}>
            Almost there!
          </Text>
        )}
      </View>
    </View>
  );
});

NextMilestoneCard.displayName = 'NextMilestoneCard';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  textCol: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  remaining: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },
  motivate: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    marginTop: 2,
  },
});

export { NextMilestoneCard };
