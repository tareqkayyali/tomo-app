/**
 * SignalTriggerSection — "What triggered this signal" rows.
 *
 * Shows 2–3 metric rows with value, baseline, and delta.
 * Color coding: positive = green, negative = amber, critical = red.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';

interface TriggerRow {
  metric: string;
  value: string;
  baseline: string;
  delta: string;
  isPositive: boolean;
}

interface SignalTriggerSectionProps {
  triggerRows: TriggerRow[];
  signalColor: string;
}

const POSITIVE_VALUE = 'rgba(122,155,118,0.70)';
const POSITIVE_DELTA = '#567A5C';
const NEGATIVE_VALUE = 'rgba(196,154,60,0.85)';
const NEGATIVE_DELTA = '#8A6A30';

export function SignalTriggerSection({ triggerRows, signalColor }: SignalTriggerSectionProps) {
  if (!Array.isArray(triggerRows) || triggerRows.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionLabel}>WHAT TRIGGERED THIS SIGNAL</Text>
      {triggerRows.map((row, i) => {
        const valueColor = row.isPositive ? POSITIVE_VALUE : NEGATIVE_VALUE;
        const deltaColor = row.isPositive ? POSITIVE_DELTA : NEGATIVE_DELTA;
        const isLast = i === triggerRows.length - 1;

        return (
          <View
            key={i}
            style={[styles.row, !isLast && styles.rowBorder]}
          >
            <View style={styles.leftBlock}>
              <Text style={styles.metricName}>{row.metric}</Text>
              <Text style={styles.baseline}>{row.baseline}</Text>
            </View>
            <View style={styles.rightBlock}>
              <Text style={[styles.value, { color: valueColor }]}>{row.value}</Text>
              <Text style={[styles.delta, { color: deltaColor }]}>{row.delta}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  leftBlock: {
    flex: 1,
  },
  metricName: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#E5EBE8',
  },
  baseline: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: '#4A5E50',
    marginTop: 1,
  },
  rightBlock: {
    alignItems: 'flex-end',
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  delta: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    marginTop: 1,
  },
});
