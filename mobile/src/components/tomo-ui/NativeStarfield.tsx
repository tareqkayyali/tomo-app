/**
 * NativeStarfield — react-native-svg port of the web CSS dark-surface
 * background. Mirrors utils/webBackground.ts 1:1 using the shared spec
 * in theme/backgroundSpec.ts: 30 deterministic stars + cream dust wash +
 * warm amber-gold core, all over the ink base.
 *
 * No-op on web (the CSS injection owns that platform). On native this
 * renders as a fixed-absolute, pointerEvents='none' layer at the root of
 * AppAtmosphere, so every screen with a transparent root shows it
 * through.
 */
import React, { memo, useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Ellipse,
} from 'react-native-svg';
import { DUST_BAND, INK, STARS } from '../../theme/backgroundSpec';

const CREAM_HEX = '#F5F3ED';
const CLAY_HEX = '#C8A27A';

const NativeStarfield: React.FC = memo(() => {
  // Early return on web — CSS (utils/webBackground.ts) handles this surface.
  if (Platform.OS === 'web') return null;

  const { width: W, height: H } = useWindowDimensions();

  const dustCx = W * DUST_BAND.centerX;
  const dustCy = H * DUST_BAND.centerY;
  const creamRx = W * DUST_BAND.cream.rxFrac;
  const creamRy = H * DUST_BAND.cream.ryFrac;
  const warmRx = W * DUST_BAND.warm.rxFrac;
  const warmRy = H * DUST_BAND.warm.ryFrac;
  const fadeStopPct = `${DUST_BAND.fadeStop * 100}%`;

  const starElements = useMemo(
    () =>
      STARS.map((s, i) => (
        <Circle
          key={i}
          cx={(W * s.x) / 100}
          cy={(H * s.y) / 100}
          r={s.size / 2}
          fill={CREAM_HEX}
          fillOpacity={s.alpha}
        />
      )),
    [W, H],
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width={W} height={H} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id="tomoDustCream" cx="50%" cy="50%" r="100%">
            <Stop offset="0%" stopColor={CREAM_HEX} stopOpacity={DUST_BAND.cream.alpha} />
            <Stop offset={fadeStopPct} stopColor={CREAM_HEX} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="tomoDustWarm" cx="50%" cy="50%" r="100%">
            <Stop offset="0%" stopColor={CLAY_HEX} stopOpacity={DUST_BAND.warm.alpha} />
            <Stop offset={fadeStopPct} stopColor={CLAY_HEX} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Base ink — matches the web `background-color: #12141F`. */}
        <Rect x={0} y={0} width={W} height={H} fill={INK} />

        {/* Dust wash — cream first (bottom of stack), warm core on top.
            The spec lists warm third "layered over the cream wash" as the
            band's warm heart, so warm paints last. */}
        <Ellipse cx={dustCx} cy={dustCy} rx={creamRx} ry={creamRy} fill="url(#tomoDustCream)" />
        <Ellipse cx={dustCx} cy={dustCy} rx={warmRx} ry={warmRy} fill="url(#tomoDustWarm)" />

        {/* Stars — rendered last so they're the topmost layer. */}
        {starElements}
      </Svg>
    </View>
  );
});

NativeStarfield.displayName = 'NativeStarfield';

export default NativeStarfield;
