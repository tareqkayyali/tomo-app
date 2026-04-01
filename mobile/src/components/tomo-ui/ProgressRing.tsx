/**
 * ProgressRing — v0-style SVG circular progress indicator.
 * Animated stroke-dashoffset on mount. Center text: percentage + label.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RingVariant = 'default' | 'success' | 'warning' | 'error';

export interface ProgressRingProps {
  /** Progress 0-100 */
  progress: number;
  /** Diameter in px — default 120 */
  size?: number;
  /** Ring stroke width — default 3 */
  strokeWidth?: number;
  /** Center label (below percentage) */
  label?: string;
  /** Smaller sublabel */
  sublabel?: string;
  /** Show percentage in center — default true */
  showPercentage?: boolean;
  /** Color variant */
  variant?: RingVariant;
}

const ProgressRing: React.FC<ProgressRingProps> = memo(({
  progress,
  size = 120,
  strokeWidth = 3,
  label,
  sublabel,
  showPercentage = true,
  variant = 'default',
}) => {
  const { colors } = useTheme();
  const animatedProgress = useSharedValue(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const variantColor = (() => {
    switch (variant) {
      case 'success': return colors.readinessGreen;
      case 'warning': return colors.warning;
      case 'error': return colors.error;
      default: return colors.electricGreen;
    }
  })();

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value / 100),
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={variantColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>

      {/* Center text */}
      <View style={styles.centerText}>
        {showPercentage && (
          <Text style={[styles.percentage, { color: colors.textPrimary }]}>
            {Math.round(progress)}%
          </Text>
        )}
        {label && (
          <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        )}
        {sublabel && (
          <Text style={[styles.sublabel, { color: colors.textDisabled }]}>{sublabel}</Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentage: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  label: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  sublabel: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
  },
});

ProgressRing.displayName = 'ProgressRing';

export default ProgressRing;
