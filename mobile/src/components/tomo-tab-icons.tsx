/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 *
 * Pixel-faithful renders of the canonical SVGs (sync from):
 *   ~/Desktop/tomo/files/tab icons/svgs/{timeline,tomo,signal}-{active,inactive}.svg
 *   (same assets are sometimes referenced as desktop/tomo/files/tab-icons/svgs/)
 *
 * Why two render paths:
 *   - On WEB, react-native-svg parses the SVG into its own component tree
 *     and mis-resolves percentage-unit RadialGradients + url(#id) refs,
 *     causing the Tomo sphere to render fully white. We render the raw
 *     SVG markup straight into the DOM, which the browser handles
 *     natively and pixel-perfectly.
 *   - On NATIVE (iOS/Android), there is no DOM. We use SvgXml from
 *     react-native-svg, which on native correctly handles the same
 *     markup including percentage gradients.
 */
import React from 'react';
import { Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

type IconProps = { size?: number; on?: boolean };

// ─── Timeline ─────────────────────────────────────────────────────────
const TIMELINE_ON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
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

const TIMELINE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
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

// ─── Tomo ─────────────────────────────────────────────────────────────
const TOMO_ON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
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

const TOMO_OFF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
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

// ─── Signal ───────────────────────────────────────────────────────────
const SIGNAL_ON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
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

const SIGNAL_OFF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none">
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

// On web, inject the raw SVG into the DOM via dangerouslySetInnerHTML so
// the browser parses it natively (preserves gradient url(#id) refs and
// percentage units, which react-native-svg's web parser breaks).
function WebSvg({ xml, size }: { xml: string; size: number }) {
  // Force the inner <svg> to honor the requested size. The raw markup has
  // no width/height attrs so a wrapper style suffices.
  const html = xml.replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
  // eslint-disable-next-line react/no-danger
  return <div style={{ width: size, height: size, lineHeight: 0 } as any} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PlatformSvg({ xml, size }: { xml: string; size: number }) {
  if (Platform.OS === 'web') {
    return <WebSvg xml={xml} size={size} />;
  }
  return (
    <View style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

export function IconTimeline({ size = 32, on = false }: IconProps) {
  return <PlatformSvg xml={on ? TIMELINE_ON : TIMELINE_OFF} size={size} />;
}

export function IconTomo({ size = 64, on = false }: IconProps) {
  return <PlatformSvg xml={on ? TOMO_ON : TOMO_OFF} size={size} />;
}

export function IconSignal({ size = 32, on = false }: IconProps) {
  return <PlatformSvg xml={on ? SIGNAL_ON : SIGNAL_OFF} size={size} />;
}
