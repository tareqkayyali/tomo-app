/**
 * PillSelector — wraps the Tomo chat PillChipRow primitive while
 * preserving the existing capsule API (options: {id,label}, selected id).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PillChipRow, T } from '../../tomo';

interface PillOption {
  id: string;
  label: string;
}

interface PillSelectorProps {
  options: PillOption[];
  selected?: string;
  onSelect: (id: string) => void;
  label?: string;
  disabledIds?: string[];
  /** Tighter pill padding/gap so 6–7 options fit one row in narrow capsules. */
  compact?: boolean;
}

export function PillSelector({
  options,
  selected,
  onSelect,
  label,
  disabledIds,
  compact,
}: PillSelectorProps) {
  const ids = options.map((o) => o.id);
  const byId = new Map(options.map((o) => [o.id, o.label] as const));
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <PillChipRow<string>
        values={ids}
        selected={selected}
        onPick={onSelect}
        labelOf={(id) => byId.get(id) ?? id}
        disabledValues={disabledIds}
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.cream55,
    marginBottom: 8,
  },
});
