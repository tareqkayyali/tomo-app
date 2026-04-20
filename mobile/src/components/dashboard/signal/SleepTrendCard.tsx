/**
 * SleepTrendCard — last 7 nights at a glance.
 *
 * Header: "SLEEP · 7 NIGHTS" + trend pill. Headline: avg hours vs target.
 * Body: SVG sparkline with dashed target line, area fill under the line,
 * last-night dot emphasized. Footer: debt bar in tan. Tapping routes to
 * Metrics → Sleep detail (caller wires route via onPress).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, {
  Polyline,
  Polygon,
  Line,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

const TAN = '#C8A27A'; // debt bar fill (warning hue, per spec)

interface Props {
  /** 7 nights of sleep in hours, most-recent LAST. Missing nights can be null. */
  nights: (number | null)[];
  nightsLabels: string[];
  weekAvg: number;
  target: number;
  debt: number;
  trend: 'rising' | 'falling' | 'flat';
  onPress?: () => void;
}

const CHART_W = 260;
const CHART_H = 56;

export function SleepTrendCard({
  nights,
  nightsLabels,
  weekAvg,
  target,
  debt,
  trend,
  onPress,
}: Props) {
  const { colors } = useTheme();

  const validNights = nights.map((n) => (typeof n === 'number' ? n : 0));
  const maxHours = Math.max(target + 1.5, ...validNights, 1);
  const minHours = Math.min(target - 1.5, ...validNights, target);
  const span = Math.max(0.5, maxHours - minHours);

  const xStep = CHART_W / Math.max(1, validNights.length - 1);
  const yFor = (h: number) => {
    const norm = (h - minHours) / span;
    return CHART_H - norm * (CHART_H - 6) - 3;
  };

  const points = validNights
    .map((h, i) => `${i * xStep},${yFor(h)}`)
    .join(' ');

  const areaPoints = validNights.length > 0
    ? `0,${CHART_H} ${points} ${(validNights.length - 1) * xStep},${CHART_H}`
    : '';

  const targetY = yFor(target);

  const lastIdx = validNights.length - 1;

  const trendLabel =
    trend === 'rising' ? '↗ rising' : trend === 'falling' ? '↘ falling' : '→ flat';
  const trendColor =
    trend === 'rising'
      ? colors.accentLight
      : trend === 'falling'
      ? TAN
      : colors.textMuted;

  const debtPct = Math.max(0, Math.min(100, (debt / (target * 2)) * 100));

  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.creamMuted,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          SLEEP · 7 NIGHTS
        </Text>
        <Text style={[styles.trend, { color: trendColor }]}>{trendLabel}</Text>
      </View>

      {/* Headline */}
      <View style={styles.headlineRow}>
        <Text style={[styles.value, { color: colors.textPrimary }]}>
          {weekAvg.toFixed(1)}
        </Text>
        <Text style={[styles.valueUnit, { color: colors.textMuted }]}>
          {` hrs avg · target ${target}`}
        </Text>
      </View>

      {/* Sparkline */}
      <View style={styles.chartWrap}>
        <Svg
          width="100%"
          height={CHART_H}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
        >
          <Defs>
            <SvgLinearGradient id="sleepArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.28" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>

          {/* Dashed target line */}
          <Line
            x1="0"
            y1={targetY}
            x2={CHART_W}
            y2={targetY}
            stroke={colors.creamMuted}
            strokeWidth="1"
            strokeDasharray="3,3"
          />

          {/* Area under line */}
          {areaPoints ? (
            <Polygon points={areaPoints} fill="url(#sleepArea)" />
          ) : null}

          {/* Line */}
          {points ? (
            <Polyline
              points={points}
              stroke={colors.accent}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}

          {/* Dots */}
          {validNights.map((h, i) => (
            <Circle
              key={i}
              cx={i * xStep}
              cy={yFor(h)}
              r={i === lastIdx ? 3 : 1.5}
              fill={i === lastIdx ? colors.accentLight : colors.accent}
            />
          ))}
        </Svg>

        {/* Day labels */}
        <View style={styles.dayLabelRow}>
          {nightsLabels.map((l, i) => (
            <Text
              key={`${l}-${i}`}
              style={[
                styles.dayLabel,
                { color: i === lastIdx ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {l}
            </Text>
          ))}
        </View>
      </View>

      {/* Debt row */}
      <View style={[styles.debtRow, { borderTopColor: colors.borderLight }]}>
        <Text style={[styles.debtLabel, { color: colors.textMuted }]}>DEBT</Text>
        <View
          style={[styles.debtTrack, { backgroundColor: colors.creamMuted }]}
        >
          <View
            style={[
              styles.debtFill,
              { backgroundColor: TAN, width: `${debtPct}%` },
            ]}
          />
        </View>
        <Text style={[styles.debtValue, { color: colors.textPrimary }]}>
          {`${debt.toFixed(1)}h`}
        </Text>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  trend: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 26,
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  valueUnit: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  chartWrap: {
    marginBottom: 10,
  },
  dayLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  dayLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  debtLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  debtTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  debtFill: {
    height: '100%',
    borderRadius: 2,
  },
  debtValue: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
});
