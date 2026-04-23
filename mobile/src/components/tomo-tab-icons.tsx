/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 * Sage-luminous orbit family. Active state = brighter sage + halo.
 * Source of truth: desktop/tomo/files/tab-icons-handoff.md
 *
 * All RadialGradients use gradientUnits="userSpaceOnUse" with absolute
 * coordinates because react-native-svg-web mis-resolves percentage units
 * (objectBoundingBox), producing collapsed/oversized gradients on web.
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
          r={on ? 2.4 : 1.8}
          fx={22.4}
          fy={6.8}
          gradientUnits="userSpaceOnUse"
        >
          {on ? (
            <>
              <Stop offset="0%" stopColor="#E0EFDA" />
              <Stop offset="55%" stopColor="#C8DCC3" />
              <Stop offset="100%" stopColor="#7A9B76" />
            </>
          ) : (
            <>
              <Stop offset="0%" stopColor="#F5F3ED" />
              <Stop offset="100%" stopColor="rgba(245,243,237,0.55)" />
            </>
          )}
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
      <Circle cx={22.4} cy={6.8} r={on ? 2.4 : 1.8} fill={`url(#tl-now-${k})`} />
      {on && <Circle cx={21.8} cy={6.3} r={0.7} fill="rgba(255,255,255,0.8)" />}
    </Svg>
  );
}

// ─── Tomo · planet + glass sphere ───
export function IconTomo({ size = 64, on = false }: IconProps) {
  const k = on ? 'on' : 'off';
  // Sphere geometry — center (32,32), radius depends on state.
  const cx = 32;
  const cy = 32;
  const r = on ? 21 : 17;

  // Globe: bright spot upper-left, deep sage rim. Center ~38%/32% of sphere.
  const globeCx = cx - r * 0.24; // shift left
  const globeCy = cy - r * 0.36; // shift up
  const globeR = r * 1.4; // overshoots so rim lands in deep sage

  // Specular highlight — small bright dot upper-left.
  const hlCx = cx - r * 0.32;
  const hlCy = cy - r * 0.44;
  const hlR = r * 0.62;

  // Terminator shadow — darkens lower-right.
  const termCx = cx + r * 0.44;
  const termCy = cy + r * 0.28;
  const termR = r * 1.05;

  // Atmosphere halo (active only) — soft sage rim outside the sphere.
  const atmosR = r + 9;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <RadialGradient
          id={`sp-globe-${k}`}
          cx={globeCx}
          cy={globeCy}
          r={globeR}
          fx={globeCx}
          fy={globeCy}
          gradientUnits="userSpaceOnUse"
        >
          {on ? (
            <>
              <Stop offset="0%" stopColor="#DCEBD6" />
              <Stop offset="35%" stopColor="#A8C3A2" />
              <Stop offset="75%" stopColor="#7A9B76" />
              <Stop offset="100%" stopColor="#4F6B4C" />
            </>
          ) : (
            <>
              <Stop offset="0%" stopColor="#BED0B9" />
              <Stop offset="45%" stopColor="#849F80" />
              <Stop offset="100%" stopColor="#3F5A3C" />
            </>
          )}
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
          r={atmosR}
          fx={cx}
          fy={cy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={(r / atmosR).toFixed(3)} stopColor="rgba(122,155,118,0)" />
          <Stop offset={((r + 4) / atmosR).toFixed(3)} stopColor="rgba(122,155,118,0.38)" />
          <Stop offset="1" stopColor="rgba(122,155,118,0)" />
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
      {on && <Circle cx={cx} cy={cy} r={atmosR} fill={`url(#sp-atmos-${k})`} />}
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
      {on && (
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={0.6}
        />
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
          {on ? (
            <>
              <Stop offset="0%" stopColor="#C8DCC3" />
              <Stop offset="60%" stopColor="#7A9B76" />
              <Stop offset="100%" stopColor="#4F6B4C" />
            </>
          ) : (
            <>
              <Stop offset="0%" stopColor="#A6BFA2" />
              <Stop offset="60%" stopColor="#6E8B6A" />
              <Stop offset="100%" stopColor="#3E5A3C" />
            </>
          )}
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
