/**
 * HexagonRadar — SVG hexagonal radar chart for attribute visualization.
 * 6 vertices at 60° intervals. Animated fill grow from center.
 *
 * Sport-agnostic: accepts a generic array of attribute descriptors.
 * Works identically for football (PAC/SHO/PAS/DRI/DEF/PHY) and
 * padel (POW/REF/CON/STA/AGI/TAC) — same 6-vertex hexagon.
 *
 * Research basis:
 * - FIFA card system is universally recognized by 13-23 demographic
 * - 6 visible stats on a radar for quick visual comparison
 * - Aspirational identity: shape represents "who I could be"
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
} from 'react-native-reanimated';
import { useRadarGrow } from '../hooks/useAnimations';
import { fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useComponentStyle } from '../hooks/useComponentStyle';
import type { ThemeColors } from '../theme/colors';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

// ═══ GENERIC ATTRIBUTE DESCRIPTOR ═══

/**
 * Sport-agnostic attribute for the radar chart.
 * Each vertex of the hexagon maps to one attribute.
 */
export interface RadarAttribute {
  /** Unique key identifying this attribute (e.g., 'pace', 'power') */
  key: string;
  /** 3-char abbreviation displayed at the vertex (e.g., 'PAC', 'POW') */
  label: string;
  /** Current score (0 to maxValue) */
  value: number;
  /** Maximum possible score (typically 99) */
  maxValue: number;
  /** Hex color for this attribute's vertex dot and label */
  color: string;
}

export interface HexagonRadarProps {
  /** Array of attributes (3-8), one per radar vertex, in display order — dynamically adjusts shape */
  attributes: RadarAttribute[];
  /** Optional benchmark attributes for a second reference polygon (e.g. P50 norms) */
  benchmarkAttributes?: RadarAttribute[];
  /** SVG canvas size in px (default 220) */
  size?: number;
  /** Whether to animate the polygon grow on mount (default true) */
  animate?: boolean;
  /** Called when the user taps an attribute label */
  onAttributeTap?: (key: string) => void;
  /** Fill color for the data polygon (default colors.accent) */
  fillColor?: string;
  /** Fill opacity for the data polygon (default 0.25) */
  fillOpacity?: number;
  /** Fill color for the benchmark polygon (default colors.textPrimary) */
  benchmarkColor?: string;
  /** Fill opacity for the benchmark polygon (default 0.08) */
  benchmarkOpacity?: number;
}

// ═══ GEOMETRY HELPERS ═══

/** Get vertex position at angle index i (0 = top, clockwise), N = total vertices */
function getVertex(cx: number, cy: number, radius: number, index: number, total: number = 6) {
  const angle = (2 * Math.PI / total) * index - Math.PI / 2; // start top, go clockwise
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function pointsString(cx: number, cy: number, radius: number, total: number = 6): string {
  return Array.from({ length: total }, (_, i) => {
    const v = getVertex(cx, cy, radius, i, total);
    return `${v.x},${v.y}`;
  }).join(' ');
}

// ═══ COMPONENT ═══

export function HexagonRadar({
  attributes,
  benchmarkAttributes,
  size = 220,
  animate = true,
  onAttributeTap,
  fillColor: fillColorProp,
  fillOpacity = 0.25,
  benchmarkColor: benchmarkColorProp,
  benchmarkOpacity = 0.08,
}: HexagonRadarProps) {
  const { colors } = useTheme();
  const fillColor = fillColorProp ?? colors.accent;
  const benchmarkColor = benchmarkColorProp ?? colors.textPrimary;
  const { getComponentStyle } = useComponentStyle();
  const radarLabelStyle = getComponentStyle('radar_label');
  const radarScoreStyle = getComponentStyle('radar_score');
  const s = useMemo(() => createStyles(colors), [colors]);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30; // leave room for labels
  const numAxes = attributes.length || 6; // dynamic vertex count

  const progress = useRadarGrow(animate);

  // Grid rings at 25%, 50%, 75%, 100%
  const gridRings = [0.25, 0.5, 0.75, 1.0];

  // Build data vertex points from generic attributes
  const dataVertices = useMemo(() => {
    return attributes.map((attr, i) => {
      const ratio = attr.maxValue > 0 ? attr.value / attr.maxValue : 0;
      return { attr, ratio, index: i };
    });
  }, [attributes]);

  // Build benchmark vertex points (static reference polygon)
  const benchmarkVertices = useMemo(() => {
    if (!benchmarkAttributes) return null;
    return benchmarkAttributes.map((attr, i) => {
      const ratio = attr.maxValue > 0 ? attr.value / attr.maxValue : 0;
      return { attr, ratio, index: i };
    });
  }, [benchmarkAttributes]);

  // Static benchmark polygon points string
  const benchmarkPointsStr = useMemo(() => {
    if (!benchmarkVertices) return '';
    return benchmarkVertices
      .map(({ ratio, index }) => {
        const r = maxR * ratio;
        const angle = (2 * Math.PI / numAxes) * index - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  }, [benchmarkVertices, maxR, cx, cy]);

  // Animated points string for the data polygon
  const animatedProps = useAnimatedProps(() => {
    const pts = dataVertices
      .map(({ ratio, index }) => {
        const r = maxR * ratio * progress.value;
        const angle = (2 * Math.PI / numAxes) * index - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
    return { points: pts };
  });

  return (
    <View style={[s.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Grid rings — subtle spider web */}
        {gridRings.map((pct) => (
          <Polygon
            key={pct}
            points={pointsString(cx, cy, maxR * pct, numAxes)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.10)"
            strokeWidth={0.5}
          />
        ))}

        {/* Axis lines — subtle radial */}
        {attributes.map((_, i) => {
          const v = getVertex(cx, cy, maxR, i, numAxes);
          return (
            <Line
              key={i}
              x1={cx}
              y1={cy}
              x2={v.x}
              y2={v.y}
              stroke="rgba(255, 255, 255, 0.10)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Benchmark polygon — P50 peer average (visible reference shape) */}
        {benchmarkPointsStr ? (
          <>
            <Polygon
              points={benchmarkPointsStr}
              fill="none"
              stroke="#00D9FF"
              strokeWidth={1.5}
              strokeOpacity={0.6}
              strokeDasharray="6,4"
            />
          </>
        ) : null}

        {/* Data polygon (animated) */}
        <AnimatedPolygon
          animatedProps={animatedProps}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke="none"
          strokeWidth={0}
        />

        {/* Lines connecting adjacent data vertices */}
        {dataVertices.map(({ ratio, index }, i) => {
          const next = dataVertices[(i + 1) % dataVertices.length];
          const r1 = maxR * ratio;
          const r2 = maxR * next.ratio;
          const v1 = getVertex(cx, cy, r1, index, numAxes);
          const v2 = getVertex(cx, cy, r2, next.index, numAxes);
          return (
            <Line
              key={`edge-${i}`}
              x1={v1.x}
              y1={v1.y}
              x2={v2.x}
              y2={v2.y}
              stroke={colors.background}
              strokeWidth={1.5}
              strokeOpacity={0.9}
            />
          );
        })}

        {/* Vertex dots */}
        {dataVertices.map(({ attr, ratio, index }) => {
          const r = maxR * ratio;
          const v = getVertex(cx, cy, r, index, numAxes);
          return (
            <Circle
              key={attr.key}
              cx={v.x}
              cy={v.y}
              r={4}
              fill={attr.color}
              stroke={colors.background}
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>

      {/* Attribute labels around the hexagon */}
      {attributes.map((attr, i) => {
        const labelR = maxR + 22;
        const v = getVertex(cx, cy, labelR, i, numAxes);

        return (
          <Pressable
            key={attr.key}
            onPress={() => onAttributeTap?.(attr.key)}
            style={[
              s.labelContainer,
              {
                left: v.x - 20,
                top: v.y - 12,
              },
            ]}
            accessibilityLabel={`${attr.label} ${attr.value}`}
          >
            <Text style={[s.labelText, { color: attr.color }, radarLabelStyle]}>
              {attr.label}
            </Text>
            <Text style={[s.labelScore, radarScoreStyle]}>{attr.value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignSelf: 'center',
      position: 'relative',
    },
    labelContainer: {
      position: 'absolute',
      alignItems: 'center',
      width: 40,
    },
    labelText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 0.5,
    },
    labelScore: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
      marginTop: 1,
    },
  });
}
