/**
 * TomoLogo — Bond mark + "tomo" wordmark.
 *
 * Bond is the brand mark: two circles of radius 26 (in a 100-unit field),
 * tangent at the center, each with a 5° aperture cut from its outer end.
 * See tomo_handoff/brand-guide.md and tomo_handoff/react/Bond.tsx for the
 * canonical definition; path coordinates below match that file exactly for
 * aperture=5°.
 *
 * API preserved from the v0 SignalArcs logo so existing call-sites work
 * unchanged: <TomoLogo variant="icon|wordmark|full" size="sm|md|lg"/>.
 */
import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';

type LogoVariant = 'icon' | 'wordmark' | 'full';
type LogoSize = 'sm' | 'md' | 'lg';

export interface TomoLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
}

// Bond aspect ratio: viewBox is -5 22 110 56 → 110 wide × 56 tall.
// Sizing is keyed off the MARK HEIGHT so wordmark/text rhythm is preserved
// with the old v0 logo which was square.
const SIZE_MAP: Record<LogoSize, { markHeight: number; textSize: number; taglineSize: number; gap: number }> = {
  sm: { markHeight: 24, textSize: 20, taglineSize: 8,  gap: 6 },
  md: { markHeight: 32, textSize: 24, taglineSize: 9,  gap: 8 },
  lg: { markHeight: 48, textSize: 36, taglineSize: 10, gap: 10 },
};

const BOND_ASPECT = 110 / 56; // width / height

function BondMark({ height, color }: { height: number; color: string }) {
  const width = height * BOND_ASPECT;
  return (
    <Svg width={width} height={height} viewBox="-5 22 110 56" fill="none">
      <Path
        d="M -1.9753 48.8659 A 26 26 0 1 1 -1.9753 51.1341"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 101.9753 51.1341 A 26 26 0 1 1 101.9753 48.8659"
        stroke={color}
        strokeWidth={7}
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
  const markColor = colors.tomoSage;

  if (variant === 'icon') {
    return <BondMark height={s.markHeight} color={markColor} />;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.row, { gap: s.gap }]}>
        <BondMark height={s.markHeight} color={markColor} />
        <Text
          style={[
            styles.wordmark,
            {
              fontSize: s.textSize,
              color: colors.textPrimary,
              letterSpacing: s.textSize * -0.035,
            },
          ]}
        >
          tomo
        </Text>
      </View>
      {variant === 'full' && (
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
    fontFamily: fontFamily.medium,
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
