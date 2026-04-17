/**
 * RecListSection — AI recommendation cards.
 *
 * Config:
 *   max_items: number — max recs to show (default: 3)
 *   priority_filter: string[] — e.g. ["P1", "P2"] (default: all)
 *   show_reasoning: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius, spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const PRIORITY_COLORS: Record<string, string> = {
  P1: '#A05A4A',
  P2: '#c49a3c',
  P3: '#5A8A9F',
  P4: '#7a9b76',
};

export const RecListSection = memo(function RecListSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const maxItems = (config.max_items as number) ?? 3;
  const showReasoning = (config.show_reasoning as boolean) ?? true;

  const recs = bootData.dashboardRecs ?? [];
  const displayed = recs.slice(0, maxItems);

  if (displayed.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.chalk }]}>AI Recommendations</Text>

      {displayed.map((rec, i) => {
        const pKey = `P${rec.priority}`;
        const pColor = PRIORITY_COLORS[pKey] ?? colors.chalkDim;

        return (
          <View
            key={rec.recId ?? `rec-${i}`}
            style={[styles.recCard, { borderLeftColor: pColor }]}
          >
            <View style={styles.recHeader}>
              <Text style={[styles.recPriority, { color: pColor }]}>{pKey}</Text>
              <Text style={[styles.recType, { color: colors.chalkDim }]}>
                {rec.type?.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={[styles.recTitle, { color: colors.chalk }]}>{rec.title}</Text>
            {showReasoning && rec.bodyShort ? (
              <Text style={[styles.recBody, { color: colors.chalkDim }]}>
                {rec.bodyShort}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    marginBottom: 12,
  },
  recCard: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  recPriority: {
    fontFamily: fontFamily.display,
    fontSize: 11,
  },
  recType: {
    fontFamily: fontFamily.note,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  recBody: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
