/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 *
 * Handoff SVGs: ~/Desktop/tomo/files/tab icons/svgs/{timeline,tomo,signal}-{active,inactive}.svg
 *
 * Rendering:
 *   - WEB: raw markup via dangerouslySetInnerHTML (browser-native SVG parser).
 *   - NATIVE: declarative react-native-svg (SvgXml mis-paints % / objectBoundingBox
 *     gradients vs the handoff; JSX gradients match the rest of the app).
 */
import React from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

type IconProps = { size?: number; on?: boolean };

// ─── Web: designer XML (no root width/height — WebSvg injects size) ───

const TIMELINE_ON_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
  <defs>
    <linearGradient id="tlArcOn" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(245,243,237,0.70)" stop-opacity="0.15"/>
      <stop offset="0.6" stop-color="rgba(245,243,237,0.70)" stop-opacity="0.50"/>
      <stop offset="1" stop-color="#7A9B76" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="tlNowOn" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#E0EFDA"/>
      <stop offset="55%" stop-color="#C8DCC3"/>
      <stop offset="100%" stop-color="#7A9B76"/>
    </radialGradient>
  </defs>
  <path d="M 4 22 Q 10 14 24 6" stroke="url(#tlArcOn)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <circle cx="5.6" cy="19.8" r="2" fill="rgba(245,243,237,0.70)" opacity="0.08"/>
  <circle cx="5.6" cy="19.8" r="1" fill="rgba(245,243,237,0.70)" opacity="0.55"/>
  <circle cx="12" cy="13.5" r="3" fill="rgba(245,243,237,0.70)" opacity="0.10"/>
  <circle cx="12" cy="13.5" r="1.6" fill="rgba(245,243,237,0.70)" opacity="0.80"/>
  <circle cx="22.4" cy="6.8" r="5.5" fill="#7A9B76" opacity="0.18"/>
  <circle cx="22.4" cy="6.8" r="4" fill="#7A9B76" opacity="0.25"/>
  <circle cx="22.4" cy="6.8" r="2.4" fill="url(#tlNowOn)"/>
  <circle cx="21.8" cy="6.3" r="0.7" fill="rgba(255,255,255,0.8)"/>
</svg>`;

const TIMELINE_OFF_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
  <defs>
    <linearGradient id="tlArcOff" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(245,243,237,0.40)" stop-opacity="0.08"/>
      <stop offset="0.6" stop-color="rgba(245,243,237,0.40)" stop-opacity="0.35"/>
      <stop offset="1" stop-color="rgba(245,243,237,0.40)" stop-opacity="0.40"/>
    </linearGradient>
    <radialGradient id="tlNowOff" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F5F3ED"/>
      <stop offset="100%" stop-color="rgba(245,243,237,0.55)"/>
    </radialGradient>
  </defs>
  <path d="M 4 22 Q 10 14 24 6" stroke="url(#tlArcOff)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <circle cx="5.6" cy="19.8" r="2" fill="rgba(245,243,237,0.40)" opacity="0.05"/>
  <circle cx="5.6" cy="19.8" r="1" fill="rgba(245,243,237,0.40)" opacity="0.40"/>
  <circle cx="12" cy="13.5" r="3" fill="rgba(245,243,237,0.40)" opacity="0.06"/>
  <circle cx="12" cy="13.5" r="1.6" fill="rgba(245,243,237,0.40)" opacity="0.55"/>
  <circle cx="22.4" cy="6.8" r="2.5" fill="rgba(245,243,237,0.55)" opacity="0.12"/>
  <circle cx="22.4" cy="6.8" r="1.8" fill="url(#tlNowOff)"/>
</svg>`;

const TOMO_ON_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <radialGradient id="spOn" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#DCEBD6"/>
      <stop offset="35%" stop-color="#A8C3A2"/>
      <stop offset="75%" stop-color="#7A9B76"/>
      <stop offset="100%" stop-color="#4F6B4C"/>
    </radialGradient>
    <radialGradient id="hlOn" cx="34%" cy="28%" r="26%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="atmOn" cx="50%" cy="50%" r="50%">
      <stop offset="78%" stop-color="rgba(122,155,118,0)"/>
      <stop offset="92%" stop-color="rgba(122,155,118,0.35)"/>
      <stop offset="100%" stop-color="rgba(122,155,118,0)"/>
    </radialGradient>
    <radialGradient id="termOn" cx="72%" cy="60%" r="48%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#atmOn)"/>
  <ellipse cx="32" cy="54" rx="14" ry="2" fill="rgba(0,0,0,0.35)"/>
  <circle cx="32" cy="32" r="21" fill="url(#spOn)"/>
  <circle cx="32" cy="32" r="21" fill="url(#termOn)"/>
  <circle cx="32" cy="32" r="21" fill="url(#hlOn)"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.6"/>
</svg>`;

const TOMO_OFF_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <radialGradient id="spOff" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#BED0B9"/>
      <stop offset="45%" stop-color="#849F80"/>
      <stop offset="100%" stop-color="#3F5A3C"/>
    </radialGradient>
    <radialGradient id="hlOff" cx="34%" cy="28%" r="26%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="termOff" cx="72%" cy="60%" r="48%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="52" rx="11" ry="2" fill="rgba(0,0,0,0.22)"/>
  <circle cx="32" cy="32" r="17" fill="url(#spOff)"/>
  <circle cx="32" cy="32" r="17" fill="url(#termOff)"/>
  <circle cx="32" cy="32" r="17" fill="url(#hlOff)"/>
  <circle cx="32" cy="32" r="17" fill="rgba(10,12,20,0.25)"/>
</svg>`;

const SIGNAL_ON_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
  <defs>
    <radialGradient id="scOn" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#C8DCC3"/>
      <stop offset="60%" stop-color="#7A9B76"/>
      <stop offset="100%" stop-color="#4F6B4C"/>
    </radialGradient>
    <radialGradient id="shOn" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7A9B76" stop-opacity="0.40"/>
      <stop offset="100%" stop-color="#7A9B76" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="14" cy="14" r="13" fill="url(#shOn)"/>
  <line x1="14" y1="3" x2="14" y2="7" stroke="rgba(245,243,237,0.70)" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <line x1="14" y1="21" x2="14" y2="25" stroke="rgba(245,243,237,0.70)" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <line x1="3" y1="14" x2="7" y2="14" stroke="rgba(245,243,237,0.70)" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <line x1="21" y1="14" x2="25" y2="14" stroke="rgba(245,243,237,0.70)" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <line x1="6.5" y1="6.5" x2="8.5" y2="8.5" stroke="rgba(245,243,237,0.70)" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
  <line x1="19.5" y1="19.5" x2="21.5" y2="21.5" stroke="rgba(245,243,237,0.70)" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
  <line x1="6.5" y1="21.5" x2="8.5" y2="19.5" stroke="rgba(245,243,237,0.70)" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
  <line x1="19.5" y1="8.5" x2="21.5" y2="6.5" stroke="rgba(245,243,237,0.70)" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
  <circle cx="14" cy="14" r="4" fill="url(#scOn)"/>
  <circle cx="13.3" cy="13.3" r="1.2" fill="rgba(255,255,255,0.75)"/>
</svg>`;

const SIGNAL_OFF_WEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
  <defs>
    <radialGradient id="scOff" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#A6BFA2"/>
      <stop offset="60%" stop-color="#6E8B6A"/>
      <stop offset="100%" stop-color="#3E5A3C"/>
    </radialGradient>
    <radialGradient id="shOff" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7A9B76" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#7A9B76" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="14" cy="14" r="10" fill="url(#shOff)"/>
  <line x1="14" y1="3" x2="14" y2="7" stroke="rgba(245,243,237,0.40)" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
  <line x1="14" y1="21" x2="14" y2="25" stroke="rgba(245,243,237,0.40)" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
  <line x1="3" y1="14" x2="7" y2="14" stroke="rgba(245,243,237,0.40)" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
  <line x1="21" y1="14" x2="25" y2="14" stroke="rgba(245,243,237,0.40)" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
  <line x1="6.5" y1="6.5" x2="8.5" y2="8.5" stroke="rgba(245,243,237,0.40)" stroke-width="1" stroke-linecap="round" opacity="0.22"/>
  <line x1="19.5" y1="19.5" x2="21.5" y2="21.5" stroke="rgba(245,243,237,0.40)" stroke-width="1" stroke-linecap="round" opacity="0.22"/>
  <line x1="6.5" y1="21.5" x2="8.5" y2="19.5" stroke="rgba(245,243,237,0.40)" stroke-width="1" stroke-linecap="round" opacity="0.22"/>
  <line x1="19.5" y1="8.5" x2="21.5" y2="6.5" stroke="rgba(245,243,237,0.40)" stroke-width="1" stroke-linecap="round" opacity="0.22"/>
  <circle cx="14" cy="14" r="3.2" fill="url(#scOff)"/>
  <circle cx="13.3" cy="13.3" r="0.8" fill="rgba(255,255,255,0.4)"/>
</svg>`;

function WebSvg({ xml, size }: { xml: string; size: number }) {
  const html = xml.replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
  // eslint-disable-next-line react/no-danger
  return <div style={{ width: size, height: size, lineHeight: 0 } as any} dangerouslySetInnerHTML={{ __html: html }} />;
}

function TimelineTabNative({ size, on, p }: { size: number; on: boolean; p: string }) {
  const arc = `${p}arc`;
  const now = `${p}now`;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Defs>
        <LinearGradient id={arc} x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox">
          {on ? (
            <>
              <Stop offset="0" stopColor="rgba(245,243,237,0.70)" stopOpacity={0.15} />
              <Stop offset="0.6" stopColor="rgba(245,243,237,0.70)" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#7A9B76" stopOpacity={0.75} />
            </>
          ) : (
            <>
              <Stop offset="0" stopColor="rgba(245,243,237,0.40)" stopOpacity={0.08} />
              <Stop offset="0.6" stopColor="rgba(245,243,237,0.40)" stopOpacity={0.35} />
              <Stop offset="1" stopColor="rgba(245,243,237,0.40)" stopOpacity={0.4} />
            </>
          )}
        </LinearGradient>
        <RadialGradient id={now} cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
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
        stroke={`url(#${arc})`}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      {on ? (
        <>
          <Circle cx={5.6} cy={19.8} r={2} fill="rgba(245,243,237,0.70)" opacity={0.08} />
          <Circle cx={5.6} cy={19.8} r={1} fill="rgba(245,243,237,0.70)" opacity={0.55} />
          <Circle cx={12} cy={13.5} r={3} fill="rgba(245,243,237,0.70)" opacity={0.1} />
          <Circle cx={12} cy={13.5} r={1.6} fill="rgba(245,243,237,0.70)" opacity={0.8} />
          <Circle cx={22.4} cy={6.8} r={5.5} fill="#7A9B76" opacity={0.18} />
          <Circle cx={22.4} cy={6.8} r={4} fill="#7A9B76" opacity={0.25} />
          <Circle cx={22.4} cy={6.8} r={2.4} fill={`url(#${now})`} />
          <Circle cx={21.8} cy={6.3} r={0.7} fill="rgba(255,255,255,0.8)" />
        </>
      ) : (
        <>
          <Circle cx={5.6} cy={19.8} r={2} fill="rgba(245,243,237,0.40)" opacity={0.05} />
          <Circle cx={5.6} cy={19.8} r={1} fill="rgba(245,243,237,0.40)" opacity={0.4} />
          <Circle cx={12} cy={13.5} r={3} fill="rgba(245,243,237,0.40)" opacity={0.06} />
          <Circle cx={12} cy={13.5} r={1.6} fill="rgba(245,243,237,0.40)" opacity={0.55} />
          <Circle cx={22.4} cy={6.8} r={2.5} fill="rgba(245,243,237,0.55)" opacity={0.12} />
          <Circle cx={22.4} cy={6.8} r={1.8} fill={`url(#${now})`} />
        </>
      )}
    </Svg>
  );
}

function TomoTabNative({ size, on, p }: { size: number; on: boolean; p: string }) {
  const sp = `${p}sp`;
  const hl = `${p}hl`;
  const atm = `${p}atm`;
  const term = `${p}term`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id={sp} cx="38%" cy="32%" r="70%">
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
        <RadialGradient id={hl} cx="34%" cy="28%" r="26%">
          {on ? (
            <>
              <Stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </>
          ) : (
            <>
              <Stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </>
          )}
        </RadialGradient>
        {on ? (
          <>
            <RadialGradient id={atm} cx="50%" cy="50%" r="50%">
              <Stop offset="78%" stopColor="rgba(122,155,118,0)" />
              <Stop offset="92%" stopColor="rgba(122,155,118,0.35)" />
              <Stop offset="100%" stopColor="rgba(122,155,118,0)" />
            </RadialGradient>
            <RadialGradient id={term} cx="72%" cy="60%" r="48%">
              <Stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <Stop offset="70%" stopColor="rgba(0,0,0,0)" />
              <Stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
            </RadialGradient>
          </>
        ) : (
          <RadialGradient id={term} cx="72%" cy="60%" r="48%">
            <Stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <Stop offset="70%" stopColor="rgba(0,0,0,0)" />
            <Stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
          </RadialGradient>
        )}
      </Defs>
      {on ? (
        <>
          <Circle cx={32} cy={32} r={30} fill={`url(#${atm})`} />
          <Ellipse cx={32} cy={54} rx={14} ry={2} fill="rgba(0,0,0,0.35)" />
          <Circle cx={32} cy={32} r={21} fill={`url(#${sp})`} />
          <Circle cx={32} cy={32} r={21} fill={`url(#${term})`} />
          <Circle cx={32} cy={32} r={21} fill={`url(#${hl})`} />
          <Circle
            cx={32}
            cy={32}
            r={21}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={0.6}
          />
        </>
      ) : (
        <>
          <Ellipse cx={32} cy={52} rx={11} ry={2} fill="rgba(0,0,0,0.22)" />
          <Circle cx={32} cy={32} r={17} fill={`url(#${sp})`} />
          <Circle cx={32} cy={32} r={17} fill={`url(#${term})`} />
          <Circle cx={32} cy={32} r={17} fill={`url(#${hl})`} />
          <Circle cx={32} cy={32} r={17} fill="rgba(10,12,20,0.25)" />
        </>
      )}
    </Svg>
  );
}

function SignalTabNative({ size, on, p }: { size: number; on: boolean; p: string }) {
  const sc = `${p}sc`;
  const sh = `${p}sh`;
  const strokeOn = 'rgba(245,243,237,0.70)';
  const strokeOff = 'rgba(245,243,237,0.40)';
  const stroke = on ? strokeOn : strokeOff;
  const lineOp = on ? 0.75 : 0.45;
  const diagOp = on ? 0.45 : 0.22;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Defs>
        <RadialGradient id={sc} cx="50%" cy="50%" r="50%">
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
        <RadialGradient id={sh} cx="50%" cy="50%" r="50%">
          {on ? (
            <>
              <Stop offset="0%" stopColor="#7A9B76" stopOpacity={0.4} />
              <Stop offset="100%" stopColor="#7A9B76" stopOpacity={0} />
            </>
          ) : (
            <>
              <Stop offset="0%" stopColor="#7A9B76" stopOpacity={0.12} />
              <Stop offset="100%" stopColor="#7A9B76" stopOpacity={0} />
            </>
          )}
        </RadialGradient>
      </Defs>
      <Circle cx={14} cy={14} r={on ? 13 : 10} fill={`url(#${sh})`} />
      <Line x1={14} y1={3} x2={14} y2={7} stroke={stroke} strokeWidth={1.2} strokeLinecap="round" opacity={lineOp} />
      <Line x1={14} y1={21} x2={14} y2={25} stroke={stroke} strokeWidth={1.2} strokeLinecap="round" opacity={lineOp} />
      <Line x1={3} y1={14} x2={7} y2={14} stroke={stroke} strokeWidth={1.2} strokeLinecap="round" opacity={lineOp} />
      <Line x1={21} y1={14} x2={25} y2={14} stroke={stroke} strokeWidth={1.2} strokeLinecap="round" opacity={lineOp} />
      <Line x1={6.5} y1={6.5} x2={8.5} y2={8.5} stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={diagOp} />
      <Line x1={19.5} y1={19.5} x2={21.5} y2={21.5} stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={diagOp} />
      <Line x1={6.5} y1={21.5} x2={8.5} y2={19.5} stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={diagOp} />
      <Line x1={19.5} y1={8.5} x2={21.5} y2={6.5} stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={diagOp} />
      <Circle cx={14} cy={14} r={on ? 4 : 3.2} fill={`url(#${sc})`} />
      <Circle
        cx={13.3}
        cy={13.3}
        r={on ? 1.2 : 0.8}
        fill={on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'}
      />
    </Svg>
  );
}

export function IconTimeline({ size = 32, on = false }: IconProps) {
  const p = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return <WebSvg xml={on ? TIMELINE_ON_WEB : TIMELINE_OFF_WEB} size={size} />;
  }
  return <TimelineTabNative size={size} on={on} p={p} />;
}

export function IconTomo({ size = 64, on = false }: IconProps) {
  const p = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return <WebSvg xml={on ? TOMO_ON_WEB : TOMO_OFF_WEB} size={size} />;
  }
  return <TomoTabNative size={size} on={on} p={p} />;
}

export function IconSignal({ size = 32, on = false }: IconProps) {
  const p = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return <WebSvg xml={on ? SIGNAL_ON_WEB : SIGNAL_OFF_WEB} size={size} />;
  }
  return <SignalTabNative size={size} on={on} p={p} />;
}
