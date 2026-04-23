/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 * Direct port of desktop/tomo/files/TabIcons.jsx.
 *
 * react-native-svg gotcha: conditional <RadialGradient> children inside
 * <Defs> are unreliable — the renderer may not register a gradient that
 * was conditionally mounted, leaving url(#id) refs unresolved (which
 * falls back to opaque white). Both -on and -off gradients are ALWAYS
 * defined; the consumer picks one via the url() ref.
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

// Diagnostic — confirms which build of this module is live.
console.log('[tomo-tab-icons] build:', 'always-mount-gradients-v2');

type IconProps = { size?: number; on?: boolean };

// ─── Timeline · arc with three growing dots ───────────────────────────
export function IconTimeline({ size = 44, on = false }: IconProps) {
  const stroke = on ? 'rgba(245,243,237,0.70)' : 'rgba(245,243,237,0.40)';
  const k = on ? 'on' : 'off';
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Defs>
        <LinearGradient id="tl-arc-on" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="rgba(245,243,237,0.70)" stopOpacity="0.15" />
          <Stop offset="0.6" stopColor="rgba(245,243,237,0.70)" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#7A9B76" stopOpacity="0.75" />
        </LinearGradient>
        <LinearGradient id="tl-arc-off" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="rgba(245,243,237,0.40)" stopOpacity="0.08" />
          <Stop offset="0.6" stopColor="rgba(245,243,237,0.40)" stopOpacity="0.35" />
          <Stop offset="1" stopColor="rgba(245,243,237,0.40)" stopOpacity="0.4" />
        </LinearGradient>
        <RadialGradient id="tl-now-on" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#E0EFDA" />
          <Stop offset="55%" stopColor="#C8DCC3" />
          <Stop offset="100%" stopColor="#7A9B76" />
        </RadialGradient>
        <RadialGradient id="tl-now-off" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F5F3ED" />
          <Stop offset="100%" stopColor="rgba(245,243,237,0.55)" />
        </RadialGradient>
      </Defs>
      <Path
        d="M 4 22 Q 10 14 24 6"
        stroke={`url(#tl-arc-${k})`}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="5.6" cy="19.8" r="2" fill={stroke} opacity={on ? 0.08 : 0.05} />
      <Circle cx="5.6" cy="19.8" r="1" fill={stroke} opacity={on ? 0.55 : 0.4} />
      <Circle cx="12" cy="13.5" r="3" fill={stroke} opacity={on ? 0.1 : 0.06} />
      <Circle cx="12" cy="13.5" r="1.6" fill={stroke} opacity={on ? 0.8 : 0.55} />
      {on ? <Circle cx="22.4" cy="6.8" r="5.5" fill="#7A9B76" opacity="0.18" /> : null}
      <Circle
        cx="22.4"
        cy="6.8"
        r={on ? 4 : 2.5}
        fill={on ? '#7A9B76' : 'rgba(245,243,237,0.55)'}
        opacity={on ? 0.25 : 0.12}
      />
      <Circle cx="22.4" cy="6.8" r={on ? 2.4 : 1.8} fill={`url(#tl-now-${k})`} />
      {on ? <Circle cx="21.8" cy="6.3" r="0.7" fill="rgba(255,255,255,0.8)" /> : null}
    </Svg>
  );
}

// ─── Tomo · planet sphere ────────────────────────────────────────────
export function IconTomo({ size = 80, on = false }: IconProps) {
  const k = on ? 'on' : 'off';
  const r = on ? 21 : 17;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <RadialGradient id="sp-sphere-on" cx="38%" cy="32%" r="70%">
          <Stop offset="0%" stopColor="#DCEBD6" />
          <Stop offset="35%" stopColor="#A8C3A2" />
          <Stop offset="75%" stopColor="#7A9B76" />
          <Stop offset="100%" stopColor="#4F6B4C" />
        </RadialGradient>
        <RadialGradient id="sp-sphere-off" cx="38%" cy="32%" r="70%">
          <Stop offset="0%" stopColor="#BED0B9" />
          <Stop offset="45%" stopColor="#849F80" />
          <Stop offset="100%" stopColor="#3F5A3C" />
        </RadialGradient>
        <RadialGradient id="sp-hl-on" cx="34%" cy="28%" r="26%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </RadialGradient>
        <RadialGradient id="sp-hl-off" cx="34%" cy="28%" r="26%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </RadialGradient>
        <RadialGradient id="sp-atmos-on" cx="50%" cy="50%" r="50%">
          <Stop offset="78%" stopColor="rgba(122,155,118,0)" />
          <Stop offset="92%" stopColor="rgba(122,155,118,0.35)" />
          <Stop offset="100%" stopColor="rgba(122,155,118,0)" />
        </RadialGradient>
        <RadialGradient id="sp-term-on" cx="72%" cy="60%" r="48%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="70%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </RadialGradient>
        <RadialGradient id="sp-term-off" cx="72%" cy="60%" r="48%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="70%" stopColor="rgba(0,0,0,0)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </RadialGradient>
      </Defs>
      {on ? <Circle cx="32" cy="32" r="30" fill="url(#sp-atmos-on)" /> : null}
      <Ellipse
        cx="32"
        cy={on ? 54 : 52}
        rx={on ? 14 : 11}
        ry="2"
        fill={`rgba(0,0,0,${on ? 0.35 : 0.22})`}
      />
      <Circle cx="32" cy="32" r={r} fill={`url(#sp-sphere-${k})`} />
      <Circle cx="32" cy="32" r={r} fill={`url(#sp-term-${k})`} />
      <Circle cx="32" cy="32" r={r} fill={`url(#sp-hl-${k})`} />
      {on ? (
        <Circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
      ) : (
        <Circle cx="32" cy="32" r={r} fill="rgba(10,12,20,0.25)" />
      )}
    </Svg>
  );
}

// ─── Signal · sage beacon ────────────────────────────────────────────
export function IconSignal({ size = 44, on = false }: IconProps) {
  const k = on ? 'on' : 'off';
  const rayColor = on ? 'rgba(245,243,237,0.70)' : 'rgba(245,243,237,0.40)';
  const rayMain = on ? 0.75 : 0.45;
  const rayDiag = on ? 0.45 : 0.22;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Defs>
        <RadialGradient id="sig-core-on" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C8DCC3" />
          <Stop offset="60%" stopColor="#7A9B76" />
          <Stop offset="100%" stopColor="#4F6B4C" />
        </RadialGradient>
        <RadialGradient id="sig-core-off" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#A6BFA2" />
          <Stop offset="60%" stopColor="#6E8B6A" />
          <Stop offset="100%" stopColor="#3E5A3C" />
        </RadialGradient>
        <RadialGradient id="sig-halo-on" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#7A9B76" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#7A9B76" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sig-halo-off" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#7A9B76" stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#7A9B76" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="14" cy="14" r={on ? 13 : 10} fill={`url(#sig-halo-${k})`} />
      <Line x1="14" y1="3" x2="14" y2="7" stroke={rayColor} strokeWidth="1.2" strokeLinecap="round" opacity={rayMain} />
      <Line x1="14" y1="21" x2="14" y2="25" stroke={rayColor} strokeWidth="1.2" strokeLinecap="round" opacity={rayMain} />
      <Line x1="3" y1="14" x2="7" y2="14" stroke={rayColor} strokeWidth="1.2" strokeLinecap="round" opacity={rayMain} />
      <Line x1="21" y1="14" x2="25" y2="14" stroke={rayColor} strokeWidth="1.2" strokeLinecap="round" opacity={rayMain} />
      <Line x1="6.5" y1="6.5" x2="8.5" y2="8.5" stroke={rayColor} strokeWidth="1" strokeLinecap="round" opacity={rayDiag} />
      <Line x1="19.5" y1="19.5" x2="21.5" y2="21.5" stroke={rayColor} strokeWidth="1" strokeLinecap="round" opacity={rayDiag} />
      <Line x1="6.5" y1="21.5" x2="8.5" y2="19.5" stroke={rayColor} strokeWidth="1" strokeLinecap="round" opacity={rayDiag} />
      <Line x1="19.5" y1="8.5" x2="21.5" y2="6.5" stroke={rayColor} strokeWidth="1" strokeLinecap="round" opacity={rayDiag} />
      <Circle cx="14" cy="14" r={on ? 4 : 3.2} fill={`url(#sig-core-${k})`} />
      <Circle
        cx="13.3"
        cy="13.3"
        r={on ? 1.2 : 0.8}
        fill={on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'}
      />
    </Svg>
  );
}
