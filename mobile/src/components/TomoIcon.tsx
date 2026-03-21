/**
 * TomoIcon — The "O" from the tomo logo with green wifi waves on top.
 * Used as the center tab button icon.
 */

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface TomoIconProps {
  size?: number;
  color?: string;
  waveColor1?: string;
  waveColor2?: string;
  waveColor3?: string;
}

export function TomoIcon({
  size = 48,
  color = '#FFFFFF',
  waveColor1 = '#30D158',     // darkest wave (closest)
  waveColor2 = '#5DE585',     // middle wave
  waveColor3 = '#A8F0BE',     // lightest wave (furthest)
}: TomoIconProps) {
  const cx = size / 2;
  const cy = size * 0.62;
  const r = size * 0.24;
  const strokeW = size * 0.06;

  // Wave arc parameters — centered above the O
  const waveCx = cx;
  const waveBaseY = cy - r - size * 0.04;

  // Generate arc path (concave-up arc centered above the O)
  const makeArc = (radius: number, yOffset: number) => {
    const startX = waveCx - radius;
    const endX = waveCx + radius;
    const y = waveBaseY - yOffset;
    return `M ${startX} ${y} A ${radius} ${radius} 0 0 1 ${endX} ${y}`;
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* The "O" — circle outline */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={color}
        strokeWidth={strokeW}
        fill="none"
      />
      {/* Dot left */}
      <Circle cx={cx - r} cy={cy} r={strokeW * 0.8} fill={waveColor1} />
      {/* Dot right */}
      <Circle cx={cx + r} cy={cy} r={strokeW * 0.8} fill={waveColor1} />

      {/* Wave 1 — closest/darkest */}
      <Path
        d={makeArc(r * 0.85, size * 0.02)}
        stroke={waveColor1}
        strokeWidth={strokeW * 0.9}
        strokeLinecap="round"
        fill="none"
      />
      {/* Wave 2 — middle */}
      <Path
        d={makeArc(r * 1.2, size * 0.10)}
        stroke={waveColor2}
        strokeWidth={strokeW * 0.8}
        strokeLinecap="round"
        fill="none"
      />
      {/* Wave 3 — furthest/lightest */}
      <Path
        d={makeArc(r * 1.55, size * 0.18)}
        stroke={waveColor3}
        strokeWidth={strokeW * 0.7}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
