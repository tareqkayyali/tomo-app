/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 * Sage-luminous orbit family. Active state = brighter sage + halo.
 *
 * Source of truth:
 *   desktop/tomo/files/TabIcons.jsx (web reference)
 *   desktop/tomo/files/tab icons/svgs/*.svg (canonical pixels)
 *
 * Two react-native-svg quirks vs. DOM SVG that this file works around:
 *   1. RadialGradient/LinearGradient cannot accept React.Fragment as children
 *      — Stop nodes must be direct children. Stops are returned as arrays.
 *   2. react-native-svg-web mis-resolves percentage units (objectBoundingBox)
 *      for RadialGradient — all gradients use gradientUnits="userSpaceOnUse"
 *      with absolute coordinates.
 */
import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Path,
  Circle,
  Ellipse,
  Line,
} from 'react-native-svg';

type IconProps = { size?: number; on?: boolean };

// ─── Timeline · arc with three growing dots ───
export function IconTimeline({ size = 32, on = false }: IconProps) {
  const stroke = on ? 'rgba(245,243,237,0.70)' : 'rgba(245,243,237,0.40)';
  const k = on ? 'on' : 'off';
  const nowR = on ? 2.4 : 1.8;
  const nowStops = on
    ? [
        <Stop key="0" offset="0%" stopColor="#E0EFDA" />,
        <Stop key="1" offset="55%" stopColor="#C8DCC3" />,
        <Stop key="2" offset="100%" stopColor="#7A9B76" />,
      ]
    : [
        <Stop key="0" offset="0%" stopColor="#F5F3ED" />,
        <Stop key="1" offset="100%" stopColor="rgba(245,243,237,0.55)" />,
      ];
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Defs>
        <LinearGradient id={`tl-arc-${k}`} x1={4} y1={22} x2={24} y2={6} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={stroke} stopOpacity={on ? 0.15 : 0.08} />
          <Stop offset="0.6" stopColor={stroke} stopOpacity={on ? 0.5 : 0.35} />
          <Stop offset="1" stopColor={on ? '#7A9B76' : stroke} stopOpacity={on ? 0.75 : 0.4} />
        </LinearGradient>
        <RadialGradient
          id={`tl-now-${k}`}
          cx={22.4}
          cy={6.8}
          r={nowR}
          fx={22.4}
          fy={6.8}
          gradientUnits="userSpaceOnUse"
        >
          {nowStops}
        </RadialGradient>
      </Defs>
      <Path
        d="M 4 22 Q 10 14 24 6"
        stroke={`url(#tl-arc-${k})`}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={5.6} cy={19.8} r={2} fill={stroke} opacity={on ? 0.08 : 0.05} />
      <Circle cx={5.6} cy={19.8} r={1} fill={stroke} opacity={on ? 0.55 : 0.4} />
      <Circle cx={12} cy={13.5} r={3} fill={stroke} opacity={on ? 0.1 : 0.06} />
      <Circle cx={12} cy={13.5} r={1.6} fill={stroke} opacity={on ? 0.8 : 0.55} />
      {on && <Circle cx={22.4} cy={6.8} r={5.5} fill="#7A9B76" opacity={0.18} />}
      <Circle
        cx={22.4}
        cy={6.8}
        r={on ? 4 : 2.5}
        fill={on ? '#7A9B76' : 'rgba(245,243,237,0.55)'}
        opacity={on ? 0.25 : 0.12}
      />
      <Circle cx={22.4} cy={6.8} r={nowR} fill={`url(#tl-now-${k})`} />
      {on && <Circle cx={21.8} cy={6.3} r={0.7} fill="rgba(255,255,255,0.8)" />}
    </Svg>
  );
}

// ─── Tomo · planet + glass sphere ───
export function IconTomo({ size = 64, on = false }: IconProps) {
  const k = on ? 'on' : 'off';
  const cx = 32;
  const cy = 32;
  const r = on ? 21 : 17;

  // Sphere bbox (centered on cx/cy with radius r) → used to translate the
  // canonical objectBoundingBox %s into userSpaceOnUse pixel coordinates.
  const bx0 = cx - r;
  const by0 = cy - r;
  const bw = 2 * r;
  // (bx0 + bw * px/100, by0 + bw * py/100), radius = bw * pr/100
  const sphereCx = bx0 + bw * 0.38;
  const sphereCy = by0 + bw * 0.32;
  const sphereR = bw * 0.7;
  const hlCx = bx0 + bw * 0.34;
  const hlCy = by0 + bw * 0.28;
  const hlR = bw * 0.26;
  const termCx = bx0 + bw * 0.72;
  const termCy = by0 + bw * 0.6;
  const termR = bw * 0.48;

  // Atmosphere uses a 60×60 box centered on (32,32), r=30.
  const atmR = 30;

  const sphereStops = on
    ? [
        <Stop key="0" offset="0%" stopColor="#DCEBD6" />,
        <Stop key="1" offset="35%" stopColor="#A8C3A2" />,
        <Stop key="2" offset="75%" stopColor="#7A9B76" />,
        <Stop key="3" offset="100%" stopColor="#4F6B4C" />,
      ]
    : [
        <Stop key="0" offset="0%" stopColor="#BED0B9" />,
        <Stop key="1" offset="45%" stopColor="#849F80" />,
        <Stop key="2" offset="100%" stopColor="#3F5A3C" />,
      ];

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <RadialGradient
          id={`sp-globe-${k}`}
          cx={sphereCx}
          cy={sphereCy}
          r={sphereR}
          fx={sphereCx}
          fy={sphereCy}
          gradientUnits="userSpaceOnUse"
        >
          {sphereStops}
        </RadialGradient>
        <RadialGradient
          id={`sp-hl-${k}`}
          cx={hlCx}
          cy={hlCy}
          r={hlR}
          fx={hlCx}
          fy={hlCy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={on ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'} />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </RadialGradient>
        <RadialGradient
          id={`sp-atmos-${k}`}
          cx={cx}
          cy={cy}
          r={atmR}
          fx={cx}
          fy={cy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="78%" stopColor="rgba(122,155,118,0)" />
          <Stop offset="92%" stopColor={on ? 'rgba(122,155,118,0.35)' : 'rgba(122,155,118,0)'} />
          <Stop offset="100%" stopColor="rgba(122,155,118,0)" />
        </RadialGradient>
        <RadialGradient
          id={`sp-term-${k}`}
          cx={termCx}
          cy={termCy}
          r={termR}
          fx={termCx}
          fy={termCy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="70%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="100%" stopColor={on ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.45)'} />
        </RadialGradient>
      </Defs>
      {on && <Circle cx={cx} cy={cy} r={atmR} fill={`url(#sp-atmos-${k})`} />}
      <Ellipse
        cx={cx}
        cy={on ? 54 : 52}
        rx={on ? 14 : 11}
        ry={2}
        fill={`rgba(0,0,0,${on ? 0.35 : 0.22})`}
      />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#sp-globe-${k})`} />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#sp-term-${k})`} />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#sp-hl-${k})`} />
      {on ? (
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.6} />
      ) : (
        <Circle cx={cx} cy={cy} r={r} fill="rgba(10,12,20,0.25)" />
      )}
    </Svg>
  );
}

// ─── Signal · sage beacon ───
export function IconSignal({ size = 32, on = false }: IconProps) {
  const rayColor = on ? 'rgba(245,243,237,0.70)' : 'rgba(245,243,237,0.40)';
  const rayMain = on ? 0.75 : 0.45;
  const rayDiag = on ? 0.45 : 0.22;
  const k = on ? 'on' : 'off';
  const coreR = on ? 4 : 3.2;
  const haloR = on ? 13 : 10;
  const coreStops = on
    ? [
        <Stop key="0" offset="0%" stopColor="#C8DCC3" />,
        <Stop key="1" offset="60%" stopColor="#7A9B76" />,
        <Stop key="2" offset="100%" stopColor="#4F6B4C" />,
      ]
    : [
        <Stop key="0" offset="0%" stopColor="#A6BFA2" />,
        <Stop key="1" offset="60%" stopColor="#6E8B6A" />,
        <Stop key="2" offset="100%" stopColor="#3E5A3C" />,
      ];
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Defs>
        <RadialGradient
          id={`sig-core-${k}`}
          cx={14}
          cy={14}
          r={coreR}
          fx={14}
          fy={14}
          gradientUnits="userSpaceOnUse"
        >
          {coreStops}
        </RadialGradient>
        <RadialGradient
          id={`sig-halo-${k}`}
          cx={14}
          cy={14}
          r={haloR}
          fx={14}
          fy={14}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="#7A9B76" stopOpacity={on ? 0.4 : 0.12} />
          <Stop offset="100%" stopColor="#7A9B76" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={14} cy={14} r={haloR} fill={`url(#sig-halo-${k})`} />
      <Line x1={14} y1={3} x2={14} y2={7} stroke={rayColor} strokeWidth={1.2} strokeLinecap="round" opacity={rayMain} />
      <Line x1={14} y1={21} x2={14} y2={25} stroke={rayColor} strokeWidth={1.2} strokeLinecap="round" opacity={rayMain} />
      <Line x1={3} y1={14} x2={7} y2={14} stroke={rayColor} strokeWidth={1.2} strokeLinecap="round" opacity={rayMain} />
      <Line x1={21} y1={14} x2={25} y2={14} stroke={rayColor} strokeWidth={1.2} strokeLinecap="round" opacity={rayMain} />
      <Line x1={6.5} y1={6.5} x2={8.5} y2={8.5} stroke={rayColor} strokeWidth={1} strokeLinecap="round" opacity={rayDiag} />
      <Line x1={19.5} y1={19.5} x2={21.5} y2={21.5} stroke={rayColor} strokeWidth={1} strokeLinecap="round" opacity={rayDiag} />
      <Line x1={6.5} y1={21.5} x2={8.5} y2={19.5} stroke={rayColor} strokeWidth={1} strokeLinecap="round" opacity={rayDiag} />
      <Line x1={19.5} y1={8.5} x2={21.5} y2={6.5} stroke={rayColor} strokeWidth={1} strokeLinecap="round" opacity={rayDiag} />
      <Circle cx={14} cy={14} r={coreR} fill={`url(#sig-core-${k})`} />
      <Circle
        cx={13.3}
        cy={13.3}
        r={on ? 1.2 : 0.8}
        fill={on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'}
      />
    </Svg>
  );
}
