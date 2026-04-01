/**
 * GrainTexture — SVG noise overlay for atmospheric depth.
 * Renders a full-screen grain filter that sits on top of backgrounds.
 * Uses feTurbulence for a film-grain effect at very low opacity.
 *
 * Usage: <GrainTexture /> as an absolute-positioned overlay.
 * Always set pointerEvents="none" on the parent.
 */
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Filter, FeTurbulence, Rect } from 'react-native-svg';

interface GrainTextureProps {
  /** Grain opacity — default 0.025 (very subtle) */
  opacity?: number;
  /** Noise frequency — default 0.65 */
  frequency?: number;
}

const GrainTexture: React.FC<GrainTextureProps> = memo(({
  opacity = 0.025,
  frequency = 0.65,
}) => (
  <Svg
    style={StyleSheet.absoluteFillObject}
    width="100%"
    height="100%"
    pointerEvents="none"
  >
    <Defs>
      {/* @ts-ignore — feTurbulence props work in react-native-svg */}
      <Filter id="grain" x="0" y="0" width="100%" height="100%">
        <FeTurbulence
          type="fractalNoise"
          baseFrequency={frequency}
          numOctaves={3}
          stitchTiles="stitch"
        />
      </Filter>
    </Defs>
    <Rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      filter="url(#grain)"
      opacity={opacity}
    />
  </Svg>
));

GrainTexture.displayName = 'GrainTexture';

export default GrainTexture;
