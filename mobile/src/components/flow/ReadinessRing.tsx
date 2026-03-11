/**
 * ReadinessRing — Circular SVG progress ring for readiness score
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
import { fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ReadinessLevel } from '../../types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  score: number;
  level: ReadinessLevel;
  size?: number;
}

const LEVEL_COLORS: Record<ReadinessLevel, string> = {
  GREEN: '#2ECC71',
  YELLOW: '#F39C12',
  RED: '#E74C3C',
};

const LEVEL_LABELS: Record<ReadinessLevel, string> = {
  GREEN: 'Ready',
  YELLOW: 'Caution',
  RED: 'Rest',
};

export function ReadinessRing({ score, level, size = 80 }: Props) {
  const { colors } = useTheme();
  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(score / 100, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const ringColor = LEVEL_COLORS[level];

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.glassBorder}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress ring */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.score, { color: ringColor, fontSize: size * 0.3 }]}>
          {score}
        </Text>
        <Text style={[styles.label, { color: ringColor, fontSize: size * 0.125 }]}>
          {LEVEL_LABELS[level]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
  },
  score: {
    fontFamily: fontFamily.bold,
  },
  label: {
    fontFamily: fontFamily.medium,
    marginTop: -2,
  },
});
