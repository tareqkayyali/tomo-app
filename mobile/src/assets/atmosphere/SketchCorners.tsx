/**
 * SketchCorners — Hand-drawn corner bracket marks for cards.
 * Adds a subtle "playbook" feel to card components.
 * Renders L-shaped corner marks at top-left and bottom-right.
 *
 * Usage: <SketchCorners /> inside a card with position: 'relative'.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface SketchCornersProps {
  /** Size of each corner mark in px — default 16 */
  size?: number;
  /** Stroke width — default 1.5 */
  strokeWidth?: number;
  /** Color — default chalk-faint */
  color?: string;
  /** Inset from card edge — default 8 */
  inset?: number;
}

const SketchCorners: React.FC<SketchCornersProps> = memo(({
  size = 16,
  strokeWidth = 1.5,
  color = 'rgba(245,243,237,0.15)',
  inset = 8,
}) => (
  <>
    {/* Top-left corner */}
    <View
      style={[
        styles.corner,
        {
          top: inset,
          left: inset,
          width: size,
          height: size,
          borderTopWidth: strokeWidth,
          borderLeftWidth: strokeWidth,
          borderTopColor: color,
          borderLeftColor: color,
          borderTopLeftRadius: 3,
        },
      ]}
      pointerEvents="none"
    />
    {/* Bottom-right corner */}
    <View
      style={[
        styles.corner,
        {
          bottom: inset,
          right: inset,
          width: size,
          height: size,
          borderBottomWidth: strokeWidth,
          borderRightWidth: strokeWidth,
          borderBottomColor: color,
          borderRightColor: color,
          borderBottomRightRadius: 3,
        },
      ]}
      pointerEvents="none"
    />
  </>
));

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    borderColor: 'transparent',
  },
});

SketchCorners.displayName = 'SketchCorners';

export default SketchCorners;
