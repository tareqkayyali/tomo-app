/**
 * DotHeatmap — Grid of coloured dots indicating presence/absence per cell.
 *
 * Used by the Dashboard consistency strip (28-day trained vs rest). Caller
 * supplies the prepared list of cells; the component stays layout-only so it
 * can be re-used for any binary-per-day pattern.
 */

import React from 'react';
import { View } from 'react-native';

interface Cell {
  active: boolean;
}

interface Props {
  cells: Cell[];
  activeColor: string;
  inactiveColor: string;
  /** Dot diameter. Defaults to 8. */
  size?: number;
  /** Gap between dots. Defaults to 2. */
  gap?: number;
}

export function DotHeatmap({
  cells,
  activeColor,
  inactiveColor,
  size = 8,
  gap = 2,
}: Props) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {cells.map((cell, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: cell.active ? activeColor : inactiveColor,
            margin: 1,
          }}
        />
      ))}
    </View>
  );
}
