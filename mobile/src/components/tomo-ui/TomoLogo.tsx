/**
 * TomoLogo — v0 SignalArcs SVG logo with "tomo" wordmark.
 * 3 concentric arcs + center dot. Variants: icon, wordmark, full (with tagline).
 */
import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';

type LogoVariant = 'icon' | 'wordmark' | 'full';
type LogoSize = 'sm' | 'md' | 'lg';

export interface TomoLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
}

const SIZE_MAP: Record<LogoSize, { svgSize: number; textSize: number; taglineSize: number; gap: number }> = {
  sm: { svgSize: 24, textSize: 20, taglineSize: 8, gap: 6 },
  md: { svgSize: 32, textSize: 24, taglineSize: 9, gap: 8 },
  lg: { svgSize: 48, textSize: 36, taglineSize: 10, gap: 10 },
};

function SignalArcs({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Center dot */}
      <Circle cx={12} cy={18} r={2} fill={color} />
      {/* Inner arc */}
      <Path
        d="M 8 14 C 8 11.8 9.8 10 12 10 C 14.2 10 16 11.8 16 14"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      {/* Middle arc */}
      <Path
        d="M 5 11 C 5 7.1 8.1 4 12 4 C 15.9 4 19 7.1 19 11"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const TomoLogo: React.FC<TomoLogoProps> = memo(({
  variant = 'wordmark',
  size = 'md',
}) => {
  const { colors } = useTheme();
  const s = SIZE_MAP[size];
  const accentColor = colors.electricGreen;

  if (variant === 'icon') {
    return <SignalArcs size={s.svgSize} color={accentColor} />;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.row, { gap: s.gap }]}>
        <SignalArcs size={s.svgSize} color={accentColor} />
        <Text style={[styles.wordmark, { fontSize: s.textSize, color: colors.textPrimary }]}>
          tomo
        </Text>
      </View>
      {(variant === 'full') && (
        <Text style={[styles.tagline, { fontSize: s.taglineSize, color: colors.textDisabled }]}>
          TRAIN SMARTER
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: fontFamily.medium,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});

TomoLogo.displayName = 'TomoLogo';

export default TomoLogo;
