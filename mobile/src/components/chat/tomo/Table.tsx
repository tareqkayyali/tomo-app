import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T, TIER_LABEL, tierColor, TierKind } from './tokens';

export type TableRow = {
  label: string;
  value?: string;
  tier?: TierKind;
};

/**
 * Quiet label · value · tier. One hairline per row. No shaded rows.
 * Use for schedules, test lists, subjects, anything with >4 rows.
 */
export function Table({ rows }: { rows: TableRow[] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <View
            key={`${r.label}-${i}`}
            style={[styles.row, !last && styles.rowDivider]}
          >
            <Text style={styles.label} numberOfLines={2}>
              {r.label}
            </Text>
            {r.value !== undefined && (
              <Text style={styles.value} numberOfLines={1}>
                {r.value}
              </Text>
            )}
            {r.tier && (
              <Text style={[styles.tier, { color: tierColor(r.tier) }]}>
                {TIER_LABEL[r.tier] ?? r.tier}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: T.cream06,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontFamily: T.fontRegular,
    color: T.cream90,
  },
  value: {
    fontSize: 13,
    fontFamily: T.fontMedium,
    color: T.cream,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
  tier: {
    fontSize: 9.5,
    fontFamily: T.fontMedium,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    minWidth: 68,
    textAlign: 'right',
  },
});
