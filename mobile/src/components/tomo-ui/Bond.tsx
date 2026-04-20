/**
 * Bond — the tomo mark, for React Native.
 *
 * Port of tomo_handoff/react/Bond.tsx to react-native-svg. Two circles of
 * radius 26 tangent at the center of a 100-unit field, each with a small
 * angular slice ("aperture") cut from its outer end.
 *
 * viewBox: -5 22 110 56  (width 110 × height 56, per brand-guide.md)
 * Default stroke : 7 units (= 7% of the mark's diameter)
 * Default aperture: 5° (symmetric: 2.5° above/below the horizontal midline)
 *
 * Usage:
 *   <Bond size={32}/>                             // sage accent, currentColor default
 *   <Bond size={64} color="#F5F3ED"/>             // cream on dark
 *   <Bond size={120} color={colors.tomoSage}/>    // hero scale, themed
 *
 * For brand display at ≥28 px, Bond is the canonical mark; the TomoIcon
 * sprite should not be used as a logo stand-in.
 */
import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

export interface BondProps {
  /** Width of the rendered mark in px. Height is derived from Bond's 110:56 aspect. */
  size?: number;
  /** Stroke color. Defaults to `currentColor` semantics — React Native has no
   *  native currentColor, so pass an explicit theme color. */
  color?: string;
  /** Stroke weight in viewBox units (default 7). */
  stroke?: number;
  /** Aperture size in degrees (default 5). */
  aperture?: number;
}

const BOND_ASPECT = 110 / 56; // width / height

/**
 * Pre-computed path coordinates for the default 5° aperture.
 * For non-default apertures we compute at render time; this fast path
 * avoids the trig in the common case.
 */
const DEFAULT_5DEG = {
  leftStartY:  51.1341,
  leftEndY:    48.8659,
  leftX:       -1.9753,
  rightStartY: 51.1341,
  rightEndY:   48.8659,
  rightX:      101.9753,
};

function computeGeometry(aperture: number) {
  if (aperture === 5) return DEFAULT_5DEG;
  const r = 26;
  const cx1 = 24;
  const cx2 = 76;
  const halfA = (aperture / 2) * (Math.PI / 180);
  const round = (n: number) => Number(n.toFixed(4));
  return {
    leftStartY:  round(50 + r * Math.sin(Math.PI - halfA)),
    leftEndY:    round(50 + r * Math.sin(Math.PI + halfA)),
    leftX:       round(cx1 + r * Math.cos(Math.PI - halfA)),
    rightStartY: round(50 + r * Math.sin(halfA)),
    rightEndY:   round(50 + r * Math.sin(-halfA)),
    rightX:      round(cx2 + r * Math.cos(halfA)),
  };
}

const Bond: React.FC<BondProps> = memo(({
  size = 32,
  color = '#7A9B76',
  stroke = 7,
  aperture = 5,
}) => {
  const g = computeGeometry(aperture);
  const width = size;
  const height = size / BOND_ASPECT;
  const r = 26;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="-5 22 110 56"
      fill="none"
    >
      <Path
        d={`M ${g.leftX} ${g.leftEndY} A ${r} ${r} 0 1 1 ${g.leftX} ${g.leftStartY}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M ${g.rightX} ${g.rightStartY} A ${r} ${r} 0 1 1 ${g.rightX} ${g.rightEndY}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
});

Bond.displayName = 'Bond';

export default Bond;
