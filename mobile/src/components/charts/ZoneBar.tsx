/**
 * ZoneBar — Horizontal bar divided into coloured zones with a marker.
 *
 * Used by the Dashboard ACWR indicator. Generic enough to drive any bounded
 * metric with safe / caution / danger zones (dual-load index, readiness, etc).
 */

import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { fontFamily } from '../../theme/typography';

export interface Zone {
  /** Inclusive lower bound, in the same units as `value` / `max`. */
  from: number;
  /** Exclusive upper bound. */
  to: number;
  color: string;
  /** Tint opacity appended to `color` (2-hex-digit alpha). Defaults to '40'. */
  tintHex?: string;
  /** Set to true to round this zone's trailing corners. */
  roundRight?: boolean;
  /** Set to true to round this zone's leading corners. */
  roundLeft?: boolean;
}

interface Props {
  value: number;
  max: number;
  zones: Zone[];
  width: number;
  height?: number;
  markerColor?: string;
  /** Tick labels rendered under the bar, evenly spaced. */
  tickLabels?: (number | string)[];
  tickColor?: string;
}

export function ZoneBar({
  value,
  max,
  zones,
  width,
  height = 8,
  markerColor = '#E5EBE8',
  tickLabels,
  tickColor = '#4A5E50',
}: Props) {
  const markerX = Math.max(0, Math.min(value / max, 1)) * width;

  return (
    <View>
      <Svg width={width} height={height + 12}>
        {zones.map((zone, i) => {
          const x = (zone.from / max) * width;
          const w = ((zone.to - zone.from) / max) * width;
          return (
            <Rect
              key={i}
              x={x}
              y={2}
              width={w}
              height={height}
              rx={zone.roundLeft || zone.roundRight ? 4 : 0}
              fill={`${zone.color}${zone.tintHex ?? '40'}`}
            />
          );
        })}
        <Line
          x1={markerX}
          y1={0}
          x2={markerX}
          y2={height + 4}
          stroke={markerColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
      {tickLabels && tickLabels.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          {tickLabels.map((t, i) => (
            <Text key={i} style={{ fontFamily: fontFamily.regular, fontSize: 7, color: tickColor }}>
              {t}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
