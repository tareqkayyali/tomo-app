/**
 * StatusRingSection — Circular readiness score visualization.
 *
 * Config:
 *   metric: string — snapshot field to display (default: "readiness_score")
 *   max_value: number — max scale (default: 100)
 *   label: string — label below ring (default: "Readiness")
 *   show_trend: boolean — show up/down arrow vs yesterday
 */

import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 120;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const StatusRingSection = memo(function StatusRingSection({
  config,
  coachingText,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const metric = (config.metric as string) ?? 'readiness_score';
  const maxValue = (config.max_value as number) ?? 100;
  const label = (config.label as string) ?? 'Readiness';
  const showTrend = (config.show_trend as boolean) ?? true;

  const snapshot = bootData.snapshot ?? {};
  const value = typeof snapshot[metric] === 'number' ? (snapshot[metric] as number) : 0;
  const pct = Math.min(value / maxValue, 1);

  // Ring color based on value
  const ringColor = value >= 70 ? '#7a9b76' : value >= 40 ? '#c49a3c' : '#A05A4A';

  // Animated ring fill
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [pct]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  // Trend arrow from yesterday
  const yesterdayValue = bootData.yesterdayVitals
    ? (bootData.yesterdayVitals as any)[metric] ?? null
    : null;
  const delta = yesterdayValue !== null ? value - yesterdayValue : null;
  const trendArrow = delta !== null ? (delta > 0 ? '+' : delta < 0 ? '' : '') : '';
  const trendText = delta !== null ? `${trendArrow}${delta}` : '';

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svg}>
          {/* Background ring */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={colors.chalkGhost}
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
          />
          {/* Progress ring */}
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.scoreText, { color: ringColor }]}>{Math.round(value)}</Text>
          <Text style={[styles.labelText, { color: colors.chalkDim }]}>{label}</Text>
        </View>
      </View>

      {showTrend && trendText ? (
        <Text style={[styles.trendText, { color: delta && delta > 0 ? '#7a9b76' : delta && delta < 0 ? '#A05A4A' : colors.chalkDim }]}>
          {trendText} vs yesterday
        </Text>
      ) : null}

      {coachingText ? (
        <Text style={[styles.coaching, { color: colors.chalkDim }]}>{coachingText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
  },
  scoreText: {
    fontFamily: fontFamily.display,
    fontSize: 32,
  },
  labelText: {
    fontFamily: fontFamily.note,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trendText: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    marginTop: 8,
  },
  coaching: {
    fontFamily: fontFamily.note,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
});
