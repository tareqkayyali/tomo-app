/**
 * Tomo tab icons — Timeline / Tomo / Signal.
 *
 * Rendered from PNG assets pre-rasterized from the canonical SVGs at
 * desktop/tomo/files/tab icons/svgs/ via librsvg. Bundled at @1x/@2x/@3x
 * under mobile/assets/tab-icons/.
 *
 * Why PNG instead of in-app SVG: react-native-svg's RadialGradient
 * pipeline is broken on Expo SDK 54 — gradient fills collapse to opaque
 * white regardless of structure (verified across array children, inline
 * children, conditional defs, userSpaceOnUse, percentage units, SvgXml).
 * Rasterizing offline is the only reliable way to get the design's
 * planet-style sphere onto the device.
 */
import React from 'react';
import { Image } from 'react-native';

type IconProps = { size?: number; on?: boolean };

const ASSETS = {
  timelineOn: require('../../assets/tab-icons/timeline-active.png'),
  timelineOff: require('../../assets/tab-icons/timeline-inactive.png'),
  tomoOn: require('../../assets/tab-icons/tomo-active.png'),
  tomoOff: require('../../assets/tab-icons/tomo-inactive.png'),
  signalOn: require('../../assets/tab-icons/signal-active.png'),
  signalOff: require('../../assets/tab-icons/signal-inactive.png'),
};

export function IconTimeline({ size = 44, on = false }: IconProps) {
  return (
    <Image
      source={on ? ASSETS.timelineOn : ASSETS.timelineOff}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export function IconTomo({ size = 80, on = false }: IconProps) {
  return (
    <Image
      source={on ? ASSETS.tomoOn : ASSETS.tomoOff}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export function IconSignal({ size = 44, on = false }: IconProps) {
  return (
    <Image
      source={on ? ASSETS.signalOn : ASSETS.signalOff}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
