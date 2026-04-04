/**
 * AchievementCard — Compact badge card for horizontal scroll of earned milestones.
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { MasteryMilestone } from '../../services/api';

interface AchievementCardProps {
  milestone: MasteryMilestone;
}

const TYPE_EMOJI: Record<string, string> = {
  streak: '\uD83D\uDD25',
  pr: '\uD83C\uDFC6',
  consistency: '\uD83D\uDCAA',
  goal: '\u2B50',
  milestone: '\uD83C\uDF1F',
  plan_completed: '\u2705',
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const AchievementCard: React.FC<AchievementCardProps> = memo(({ milestone }) => {
  const { colors } = useTheme();
  const emoji = TYPE_EMOJI[milestone.type] ?? '\uD83C\uDFC5';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.accent}33` }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {milestone.title}
      </Text>
      <Text style={[styles.date, { color: colors.textDisabled }]}>
        {formatDate(milestone.achieved_at)}
      </Text>
    </View>
  );
});

AchievementCard.displayName = 'AchievementCard';

const styles = StyleSheet.create({
  card: {
    width: 100,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  emoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
  date: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    marginTop: 4,
  },
});

export { AchievementCard };
