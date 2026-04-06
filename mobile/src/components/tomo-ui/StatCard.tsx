/**
 * StatCard — v0-style metric card with icon badge, value, trend arrow.
 * Supports semantic variants (success/warning/error/info) with tinted borders.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { borderRadius, animation } from '../../theme/spacing';
import TomoIcon from './TomoIcon';

type StatVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: string;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  variant?: StatVariant;
  enterIndex?: number;
}

function TrendArrow({ direction, color }: { direction: 'up' | 'down' | 'neutral'; color: string }) {
  if (direction === 'neutral') return null;
  const points = direction === 'up' ? '1.5,0 3,3 0,3' : '0,0 3,0 1.5,3';
  return (
    <Svg width={10} height={10} viewBox="0 0 3 3">
      <Polygon points={points} fill={color} />
    </Svg>
  );
}

const StatCard: React.FC<StatCardProps> = memo(({
  label,
  value,
  sublabel,
  icon,
  trend,
  variant = 'default',
  enterIndex = 0,
}) => {
  const { colors } = useTheme();

  const variantColors = useMemo(() => {
    switch (variant) {
      case 'success': return { border: `${colors.readinessGreen}4D`, bg: `${colors.readinessGreen}1A`, text: colors.readinessGreen };
      case 'warning': return { border: `${colors.warning}4D`, bg: `${colors.warning}1A`, text: colors.warning };
      case 'error': return { border: `${colors.error}4D`, bg: `${colors.error}1A`, text: colors.error };
      case 'info': return { border: `${colors.info}4D`, bg: `${colors.info}1A`, text: colors.info };
      default: return { border: colors.border, bg: colors.borderLight, text: colors.textSecondary };
    }
  }, [variant, colors]);

  const trendColor = trend?.direction === 'up' ? colors.readinessGreen
    : trend?.direction === 'down' ? colors.error
    : colors.textDisabled;

  const enterDelay = enterIndex * animation.stagger.default;

  return (
    <Animated.View
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: variantColors.border }]}
    >
      {/* Top row: label + icon */}
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        {icon && (
          <View style={[styles.iconBadge, { backgroundColor: variantColors.bg }]}>
            <TomoIcon name={icon} size={14} color={variantColors.text} />
          </View>
        )}
      </View>

      {/* Value */}
      <Text style={[styles.value, { color: colors.textPrimary }]}>{value}</Text>

      {/* Bottom row: sublabel + trend */}
      <View style={styles.bottomRow}>
        {sublabel && <Text style={[styles.sublabel, { color: colors.textDisabled }]}>{sublabel}</Text>}
        {trend && (
          <View style={styles.trendRow}>
            <TrendArrow direction={trend.direction} color={trendColor} />
            <Text style={[styles.trendValue, { color: trendColor }]}>
              {trend.direction === 'up' ? '+' : ''}{trend.value}%
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    marginBottom: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sublabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendValue: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
});

StatCard.displayName = 'StatCard';

export default StatCard;
