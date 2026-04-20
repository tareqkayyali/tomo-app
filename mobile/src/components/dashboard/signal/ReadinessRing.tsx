/**
 * Signal Dashboard readiness ring — compact 68px sage-arc ring with numeric
 * value centered and a "READY" label underneath. Distinct from the flow
 * ReadinessRing (which renders level labels GREEN/YELLOW/RED) — this one is
 * purely scalar and always uses the sage accent, because the level is
 * communicated by the hero's eyebrow ("TODAY · BALANCED") and coaching line.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  value: number; // 0–100
  size?: number;
  label?: string;
  color?: string;
}

export function ReadinessRing({ value, size = 68, label = 'READY', color }: Props) {
  const { colors } = useTheme();
  const ringColor = color ?? colors.accent;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, value / 100));
    progress.value = withTiming(target, {
      duration: 800,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [value, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.creamMuted}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: colors.textPrimary }]}>
          {Math.round(value)}
        </Text>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    letterSpacing: -0.6,
    lineHeight: 22,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 7.5,
    letterSpacing: 1.2,
    marginTop: 1,
  },
});
