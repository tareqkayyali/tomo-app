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
import type { SectionProps } from './DashboardSectionRenderer';

const PRIORITY_COLORS: Record<string, string> = {
  P1: '#B08A7A',
  P2: '#C8A27A',
  P3: '#8A9BB0',
  P4: '#7A9B76',
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
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <Text style={[styles.title, { color: colors.tomoCream }]}>AI Recommendations</Text>

      {displayed.map((rec, i) => {
        const pKey = `P${rec.priority}`;
        const pColor = PRIORITY_COLORS[pKey] ?? colors.muted;
        const isHighlighted = i === 0;

        return (
          <View
            key={rec.recId ?? `rec-${i}`}
            style={[
              styles.recCard,
              {
                backgroundColor: isHighlighted ? colors.sage15 : colors.cream03,
                borderColor: isHighlighted ? colors.sage30 : colors.cream10,
              },
            ]}
          >
            <View style={styles.recHeader}>
              <Text style={[styles.recPriority, { color: pColor }]}>{pKey}</Text>
              <Text style={[styles.recType, { color: 'rgba(245,243,237,0.35)' }]}>
                {rec.type?.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={[styles.recTitle, { color: colors.tomoCream }]}>{rec.title}</Text>
            {showReasoning && rec.bodyShort ? (
              <Text style={[styles.recBody, { color: colors.muted }]}>
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  recCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  recPriority: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  recType: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  recTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  recBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
});
