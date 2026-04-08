/**
 * SignalArcIcon — SVG arc icon that encodes signal strength via opacity.
 *
 * Three concentric upward arcs + center dot.
 * Opacity of each arc is controlled by the signal's arcOpacity config.
 * PRIMED = all full, RECOVERING = builds from inside out, etc.
 */

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface SignalArcIconProps {
  color: string;
  arcOpacity: { large: number; medium: number; small: number };
  size?: number;
}

export function SignalArcIcon({ color, arcOpacity, size = 52 }: SignalArcIconProps) {
  const height = size * (34 / 52);

  return (
    <Svg viewBox="0 0 60 38" width={size} height={height}>
      {/* Large (outer) arc */}
      <Path
        d="M6 32 A24 24 0 0 1 54 32"
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        opacity={arcOpacity.large}
      />
      {/* Medium (middle) arc */}
      <Path
        d="M13 32 A17 17 0 0 1 47 32"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        opacity={arcOpacity.medium}
      />
      {/* Small (inner) arc */}
      <Path
        d="M20 32 A10 10 0 0 1 40 32"
        stroke={color}
        strokeWidth={2.0}
        fill="none"
        strokeLinecap="round"
        opacity={arcOpacity.small}
      />
      {/* Center dot */}
      <Circle cx={30} cy={32} r={3} fill={color} />
    </Svg>
  );
}
