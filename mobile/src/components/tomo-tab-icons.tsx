/**
 * Tomo tab icons — Timeline / Tomo / Signal (player bottom bar).
 *
 * Bitmaps rasterized from canonical SVGs in `assets/tab-icons/svg/` with
 * librsvg (`rsvg-convert`). Regenerate PNGs after SVG edits:
 *   cd mobile && npm run rasterize-tab-icons
 *
 * Metro resolves @2x / @3x under `assets/tab-icons/png/` so gradients,
 * highlight, terminator, and halo match the design file on every device.
 */
import React from 'react';
import { Image, ImageSourcePropType } from 'react-native';

type IconProps = { size?: number; on?: boolean };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TIMELINE_ACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/timeline-active.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TIMELINE_INACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/timeline-inactive.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TOMO_ACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/tomo-active.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TOMO_INACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/tomo-inactive.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SIGNAL_ACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/signal-active.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SIGNAL_INACTIVE: ImageSourcePropType = require('../../assets/tab-icons/png/signal-inactive.png');

function TabIconImage({ source, size }: { source: ImageSourcePropType; size: number }) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

export function IconTimeline({ size = 32, on = false }: IconProps) {
  return <TabIconImage source={on ? TIMELINE_ACTIVE : TIMELINE_INACTIVE} size={size} />;
}

export function IconTomo({ size = 64, on = false }: IconProps) {
  return <TabIconImage source={on ? TOMO_ACTIVE : TOMO_INACTIVE} size={size} />;
}

export function IconSignal({ size = 32, on = false }: IconProps) {
  return <TabIconImage source={on ? SIGNAL_ACTIVE : SIGNAL_INACTIVE} size={size} />;
}
