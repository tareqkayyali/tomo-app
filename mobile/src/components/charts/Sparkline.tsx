/**
 * Sparkline — Minimal line chart for trend visualisation.
 *
 * Shared primitive. Caller passes values in oldest-first order.
 * Optional baseline renders as a dashed horizontal reference line.
 */

import React from 'react';
import Svg, { Line, Polyline } from 'react-native-svg';

interface SparklineProps {
  values: number[];
  color: string;
  width: number;
  height: number;
  baseline?: number | null;
  strokeWidth?: number;
  /** Vertical padding around min/max so the line doesn't touch edges. */
  padY?: number;
}

export function Sparkline({
  values,
  color,
  width,
  height,
  baseline,
  strokeWidth = 1.5,
  padY = 5,
}: SparklineProps) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const min = Math.min(...values, baseline ?? Infinity) - padY;
  const max = Math.max(...values, baseline ?? -Infinity) + padY;
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const baselineY =
    baseline != null ? height - ((baseline - min) / range) * height : null;

  return (
    <Svg width={width} height={height}>
      {baselineY != null && (
        <Line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="rgba(245,243,237,0.15)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
      )}
      <Polyline
        points={points}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
