/**
 * AttributeLineChart — SVG line chart with benchmark reference lines.
 *
 * Uses react-native-svg (already installed). Shows:
 * - Solid colored line for player's score over time
 * - Dashed horizontal lines for p25 ("Below Avg"), p50 ("Average"), p75 ("Top 25%")
 * - Labels on right edge of benchmark lines
 * - No external chart library needed
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Polyline,
  Line,
  Circle as SvgCircle,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme';

interface DataPoint {
  date: string;
  value: number;
}

interface Benchmarks {
  p25: number;
  p50: number;
  p75: number;
}

interface AttributeLineChartProps {
  data: DataPoint[];
  benchmarks: Benchmarks;
  color: string;
  width?: number;
  height?: number;
}

export function AttributeLineChart({
  data,
  benchmarks,
  color,
  width = 300,
  height = 160,
}: AttributeLineChartProps) {
  const { colors } = useTheme();

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: colors.textInactive }]}>
          No data yet
        </Text>
      </View>
    );
  }

  // Chart padding
  const padTop = 12;
  const padBottom = 24;
  const padLeft = 8;
  const padRight = 56; // space for benchmark labels

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Determine value range (include benchmarks in range for proper scaling)
  const allValues = [
    ...data.map((d) => d.value),
    benchmarks.p25,
    benchmarks.p50,
    benchmarks.p75,
  ];
  const minVal = Math.min(...allValues) - 5;
  const maxVal = Math.max(...allValues) + 5;
  const range = maxVal - minVal || 1;

  // Map value → Y coordinate
  const toY = (v: number) => padTop + chartH - ((v - minVal) / range) * chartH;
  // Map index → X coordinate
  const toX = (i: number) =>
    padLeft + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);

  // Build polyline points
  const points = data
    .map((d, i) => `${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');

  // Benchmark lines
  const benchmarkLines = [
    { value: benchmarks.p75, label: 'Top 25%', dashArray: '4,4' },
    { value: benchmarks.p50, label: 'Average', dashArray: '6,4' },
    { value: benchmarks.p25, label: 'Below', dashArray: '3,6' },
  ];

  // Last data point for dot
  const lastIdx = data.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(data[lastIdx].value);

  // Date labels (first and last)
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Benchmark reference lines */}
        {benchmarkLines.map((b) => {
          const y = toY(b.value);
          // Only render if within chart bounds
          if (y < padTop - 4 || y > padTop + chartH + 4) return null;
          return (
            <React.Fragment key={b.label}>
              <Line
                x1={padLeft}
                y1={y}
                x2={padLeft + chartW}
                y2={y}
                stroke={colors.textInactive}
                strokeWidth={1}
                strokeDasharray={b.dashArray}
                opacity={0.4}
              />
              <SvgText
                x={padLeft + chartW + 4}
                y={y + 4}
                fill={colors.textInactive}
                fontSize={9}
                fontFamily={fontFamily.regular}
              >
                {b.label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Player score line */}
        {data.length >= 2 && (
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current value dot */}
        <SvgCircle cx={lastX} cy={lastY} r={5} fill={color} />
        <SvgCircle cx={lastX} cy={lastY} r={3} fill="#FFFFFF" />

        {/* Score label near dot */}
        <SvgText
          x={lastX}
          y={lastY - 10}
          fill={color}
          fontSize={12}
          fontWeight="700"
          textAnchor="middle"
        >
          {data[lastIdx].value}
        </SvgText>
      </Svg>

      {/* Date labels below chart */}
      <View style={[styles.dateRow, { paddingLeft: padLeft, width: padLeft + chartW }]}>
        <Text style={[styles.dateLabel, { color: colors.textInactive }]}>
          {formatDate(data[0].date)}
        </Text>
        {data.length > 1 && (
          <Text style={[styles.dateLabel, { color: colors.textInactive }]}>
            {formatDate(data[lastIdx].date)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    fontStyle: 'italic',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 2,
  },
  dateLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
});
