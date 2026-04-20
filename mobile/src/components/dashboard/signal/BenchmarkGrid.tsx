/**
 * BenchmarkGrid — side-by-side Strength + Gap cards for the Signal Dashboard
 * Growth section. Each card shows a small percentile ring, metric label,
 * native-unit value, cohort-relative trend, and a coaching note. Sage
 * differentiates strength from the tan gap accent.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import type { BenchmarkDetail } from '../../../services/api';

const GAP_TAN = '#C8A27A';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  strength: BenchmarkDetail | null;
  gap: BenchmarkDetail | null;
  onStrengthPress?: () => void;
  onGapPress?: () => void;
}

export function BenchmarkGrid({ strength, gap, onStrengthPress, onGapPress }: Props) {
  const { colors } = useTheme();
  if (!strength && !gap) return null;
  return (
    <View>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        Growth
      </Text>
      <View style={styles.row}>
        <BenchmarkCard
          detail={strength}
          kind="strength"
          onPress={onStrengthPress}
        />
        <BenchmarkCard
          detail={gap}
          kind="gap"
          onPress={onGapPress}
        />
      </View>
    </View>
  );
}

// ── BenchmarkCard ───────────────────────────────────────────────────

interface CardProps {
  detail: BenchmarkDetail | null;
  kind: 'strength' | 'gap';
  onPress?: () => void;
}

function BenchmarkCard({ detail, kind, onPress }: CardProps) {
  const { colors } = useTheme();
  const accent = kind === 'strength' ? colors.accent : GAP_TAN;
  const Container = onPress ? Pressable : View;

  if (!detail) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.creamMuted,
          },
        ]}
      >
        <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
          {kind === 'strength' ? 'STRENGTH' : 'GAP'}
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
          Log a test to unlock benchmark insights.
        </Text>
      </View>
    );
  }

  return (
    <Container
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: `${accent}3B`,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.kindLabel, { color: accent }]}>
          {kind === 'strength' ? 'STRENGTH' : 'GAP'}
        </Text>
        <PercentileRing percentile={detail.percentile} color={accent} />
      </View>

      <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary }]}>
        {detail.metric}
      </Text>
      <Text style={[styles.value, { color: accent }]}>
        {`${formatValue(detail.value, detail.unit)} ${detail.unit}`}
      </Text>
      <Text numberOfLines={2} style={[styles.note, { color: colors.textMuted }]}>
        {detail.note}
      </Text>
    </Container>
  );
}

function formatValue(value: number, unit: string): string {
  if (unit === 'cm' || unit === 'reps' || unit === 'm') {
    return `${Math.round(value)}`;
  }
  return value.toFixed(2);
}

// ── Percentile ring (46px) ──────────────────────────────────────────

interface RingProps {
  percentile: number;
  color: string;
}

function PercentileRing({ percentile, color }: RingProps) {
  const { colors } = useTheme();
  const size = 46;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, percentile / 100));
    progress.value = withTiming(target, {
      duration: 800,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [percentile, progress]);

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
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, { color: colors.textPrimary }]}>
          {percentile}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingTop: 13,
    paddingBottom: 12,
    paddingHorizontal: 13,
    minHeight: 160,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kindLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 15,
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.6,
    lineHeight: 22,
  },
  note: {
    fontFamily: fontFamily.light,
    fontSize: 9.5,
    lineHeight: 13,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  emptyLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
});
