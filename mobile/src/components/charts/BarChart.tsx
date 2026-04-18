/**
 * BarChart — Minimal vertical bar chart.
 *
 * Shared primitive used for sleep hours, training load, and similar.
 * Values are oldest-first. Bar width auto-computes from `width / n` if not
 * provided. Pass `colorFn` to drive per-bar colour (e.g. traffic-light on
 * sleep threshold) or `opacityFn` for per-bar opacity.
 */

import React from 'react';
import Svg, { Rect } from 'react-native-svg';

interface BarChartProps {
  values: number[];
  color: string;
  width: number;
  height: number;
  barWidth?: number;
  barGap?: number;
  colorFn?: (value: number, index: number) => string;
  opacityFn?: (value: number, index: number) => number;
  /** Force a max so bars share a scale across renders (e.g. `10` for sleep hours). */
  maxOverride?: number;
  /** Bar corner radius. Defaults to 1. */
  rx?: number;
}

export function BarChart({
  values,
  color,
  width,
  height,
  barWidth,
  barGap = 4,
  colorFn,
  opacityFn,
  maxOverride,
  rx = 1,
}: BarChartProps) {
  if (!Array.isArray(values) || values.length === 0) return null;

  const max = maxOverride ?? Math.max(...values, 1);
  const n = values.length;
  const step = width / n;
  const bw = barWidth ?? Math.max(2, step - barGap);

  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const clamped = Math.min(v, max);
        const barH = (clamped / max) * height;
        const x = i * step + (step - bw) / 2;
        const y = height - barH;
        const fill = colorFn ? colorFn(v, i) : color;
        const opacity = opacityFn ? opacityFn(v, i) : 1;
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={bw}
            height={barH}
            rx={rx}
            fill={fill}
            opacity={opacity}
          />
        );
      })}
    </Svg>
  );
}
