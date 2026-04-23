import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from './tokens';

export type MetricItem = {
  value: string;
  label: string;
  pct?: string;
  tone?: 'alert' | 'default';
};

/**
 * 2–4 typographic numeric readouts.
 * Hairline top + bottom, inline vertical dividers. No chips, no bars.
 */
export function MetricRow({ items }: { items: MetricItem[] }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <View style={styles.row}>
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const alert = it.tone === 'alert';
        return (
          <View
            key={`${it.label}-${i}`}
            style={[
              styles.cell,
              !isLast && styles.cellDivider,
            ]}
          >
            <Text
              style={[styles.value, alert && styles.valueAlert]}
              numberOfLines={1}
            >
              {it.value}
            </Text>
            <Text style={styles.label} numberOfLines={1}>
              {it.label}
            </Text>
            {it.pct !== undefined && (
              <Text style={[styles.pct, alert && styles.pctAlert]} numberOfLines={1}>
                {it.pct}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: T.cream06,
    paddingVertical: 12,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 10,
  },
  cellDivider: {
    borderRightWidth: 1,
    borderRightColor: T.cream06,
  },
  value: {
    fontSize: 17,
    fontFamily: T.fontSemiBold,
    color: T.cream,
    letterSpacing: -0.3,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  valueAlert: {
    color: T.red,
  },
  label: {
    fontSize: 9.5,
    fontFamily: T.fontMedium,
    color: T.cream55,
    marginTop: 4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pct: {
    fontSize: 10,
    fontFamily: T.fontRegular,
    color: T.sageLight,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  pctAlert: {
    color: T.red,
  },
});
