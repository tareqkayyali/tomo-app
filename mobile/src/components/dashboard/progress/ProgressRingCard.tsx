/**
 * ProgressRingCard — a circular-ring metric tile for the Signal > Progress
 * grid. Renders:
 *
 *   • A sage-coloured arc filled proportional to the value (normalised via
 *     valueMin/valueMax when both are present; otherwise the ring is full).
 *   • The numeric value in the centre, with the unit directly below.
 *   • The display name under the ring.
 *   • A delta badge ("▲ 15% vs 7d") coloured by direction semantics —
 *     higher_better: ↑ green / ↓ red; lower_better: ↑ red / ↓ green;
 *     neutral: always muted.
 *
 * Designed to fit a 2-column grid at typical phone widths. Press surface is
 * the whole card — parent passes onPress to deep-link into a detail view
 * (Phase 1 is non-interactive; prop is reserved for Phase 5+).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

export interface ProgressRingCardProps {
  displayName: string;
  displayUnit: string;
  latest: number | null;
  avg: number | null;
  deltaPct: number | null;
  direction: 'higher_better' | 'lower_better' | 'neutral';
  valueMin: number | null;
  valueMax: number | null;
  /** Optional — card is pressable when provided. */
  onPress?: () => void;
}

const SIZE = 148;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function ProgressRingCard({
  displayName,
  displayUnit,
  latest,
  avg,
  deltaPct,
  direction,
  valueMin,
  valueMax,
  onPress,
}: ProgressRingCardProps) {
  const { colors } = useTheme();

  // Normalise to 0–1 for the ring arc. If the metric config doesn't supply
  // bounds (valueMin/valueMax), render the ring at 75% so the card still
  // reads as "active" without implying a meaningful fill level.
  const fillFraction = useMemo(() => {
    if (latest == null) return 0;
    if (valueMin != null && valueMax != null && valueMax > valueMin) {
      const clamped = Math.max(valueMin, Math.min(valueMax, latest));
      return (clamped - valueMin) / (valueMax - valueMin);
    }
    return 0.75;
  }, [latest, valueMin, valueMax]);

  const dashOffset = CIRC * (1 - fillFraction);

  // Delta chip semantics
  const deltaLabel = useMemo(() => {
    if (deltaPct == null) return null;
    const pct = Math.round(deltaPct);
    if (pct === 0) return { text: '— vs 7d', positive: null as null | boolean };
    const arrow = pct > 0 ? '▲' : '▼';
    const magnitude = Math.abs(pct);
    // "positive" here means "good for the athlete" — the colour of the chip.
    // higher_better: positive when pct > 0. lower_better: positive when pct < 0.
    // neutral: no positive/negative styling.
    let positive: null | boolean = null;
    if (direction === 'higher_better') positive = pct > 0;
    else if (direction === 'lower_better') positive = pct < 0;
    return { text: `${arrow} ${magnitude}% vs 7d`, positive };
  }, [deltaPct, direction]);

  const deltaColor = useMemo(() => {
    if (!deltaLabel) return colors.textMuted;
    if (deltaLabel.positive === null) return colors.textMuted;
    return deltaLabel.positive ? colors.tomoSageDim : '#d97757';
  }, [deltaLabel, colors]);

  // Format the headline number: keep one decimal for fractional units (h, /10),
  // integers otherwise.
  const valueText = useMemo(() => {
    if (latest == null) return '—';
    const wantsDecimal = displayUnit === 'h' || displayUnit === '/10' || displayUnit === 's';
    return wantsDecimal ? latest.toFixed(1) : String(Math.round(latest));
  }, [latest, displayUnit]);

  const body = (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={styles.ringWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.accentLight} stopOpacity={1} />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity={1} />
            </SvgLinearGradient>
          </Defs>
          {/* Background ring */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.cream08 ?? 'rgba(245,243,237,0.08)'}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress arc — rotated -90° so 0% starts at the top and
              fills clockwise. */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke="url(#ringGrad)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.centerValue} pointerEvents="none">
          <Text style={[styles.value, { color: colors.textOnDark }]}>{valueText}</Text>
          <Text style={[styles.unit, { color: colors.textMuted }]}>{displayUnit || ' '}</Text>
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textMuted }]}>
        {displayName.toUpperCase()}
      </Text>

      {deltaLabel ? (
        <Text style={[styles.delta, { color: deltaColor }]}>{deltaLabel.text}</Text>
      ) : (
        <Text style={[styles.delta, { color: 'transparent' }]}>·</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 220,
  },
  ringWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  unit: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  delta: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 6,
  },
});
