/**
 * Shared spec for the Tomo dark-surface background (starfield + dust band).
 *
 * Consumed by:
 *   - utils/webBackground.ts → CSS radial-gradients on html, body (web)
 *   - components/tomo-ui/NativeStarfield.tsx → react-native-svg (native)
 *
 * Keep both renderers reading from here so the visual stays identical
 * across platforms. All values are deterministic: hand-placed positions,
 * fixed alpha per star — same render every time.
 */

export const INK = '#12141F';
export const CREAM_RGB = '245,243,237';
export const CLAY_RGB = '200,162,122';

export type Star = {
  /** X position as percent of viewport width (0-100). */
  x: number;
  /** Y position as percent of viewport height (0-100). */
  y: number;
  /** Diameter in px — 0.8 for normal, 1.4 for the ~15% that feel closer. */
  size: 0.8 | 1.4;
  /** Fill alpha (0-1). Varies 0.25–0.60 so the field reads uneven. */
  alpha: number;
};

// ~30 stars. 4 larger (13%), density clusters around the 55-65% Y band
// where the dust sits. Positions hand-picked — do not reflow on re-render.
export const STARS: readonly Star[] = [
  // Top region (0-25% Y)
  { x: 7,  y: 5,  size: 0.8, alpha: 0.35 },
  { x: 23, y: 9,  size: 0.8, alpha: 0.45 },
  { x: 58, y: 14, size: 1.4, alpha: 0.55 },
  { x: 82, y: 11, size: 0.8, alpha: 0.30 },
  { x: 95, y: 20, size: 0.8, alpha: 0.40 },
  // Upper-mid (25-50% Y)
  { x: 15, y: 29, size: 0.8, alpha: 0.35 },
  { x: 38, y: 33, size: 0.8, alpha: 0.40 },
  { x: 65, y: 27, size: 0.8, alpha: 0.50 },
  { x: 88, y: 36, size: 0.8, alpha: 0.30 },
  { x: 5,  y: 42, size: 0.8, alpha: 0.45 },
  { x: 50, y: 46, size: 0.8, alpha: 0.30 },
  // Dust-band cluster (50-68% Y)
  { x: 11, y: 54, size: 0.8, alpha: 0.45 },
  { x: 22, y: 57, size: 0.8, alpha: 0.35 },
  { x: 30, y: 58, size: 1.4, alpha: 0.60 },
  { x: 42, y: 56, size: 0.8, alpha: 0.50 },
  { x: 52, y: 61, size: 0.8, alpha: 0.40 },
  { x: 60, y: 59, size: 0.8, alpha: 0.35 },
  { x: 72, y: 63, size: 0.8, alpha: 0.50 },
  { x: 85, y: 62, size: 1.4, alpha: 0.55 },
  { x: 93, y: 57, size: 0.8, alpha: 0.30 },
  { x: 38, y: 66, size: 0.8, alpha: 0.40 },
  // Lower-mid (68-85% Y)
  { x: 8,  y: 72, size: 0.8, alpha: 0.40 },
  { x: 25, y: 76, size: 0.8, alpha: 0.30 },
  { x: 48, y: 79, size: 0.8, alpha: 0.45 },
  { x: 67, y: 74, size: 0.8, alpha: 0.35 },
  { x: 12, y: 82, size: 1.4, alpha: 0.50 },
  { x: 80, y: 84, size: 0.8, alpha: 0.40 },
  // Bottom (85-100% Y)
  { x: 33, y: 89, size: 0.8, alpha: 0.30 },
  { x: 59, y: 93, size: 0.8, alpha: 0.40 },
  { x: 88, y: 96, size: 0.8, alpha: 0.35 },
];

// Dust band: wide shallow horizontal ellipse centered left-of-middle at
// 30% X, 60% Y. Two layers — a cream wash (broader, softer) and a warm
// amber-gold core (narrower, gives the band a warm heart).
//
// CSS: radial-gradient(ellipse 160% 18% at 30% 60%, cream, transparent 55%)
// On native we approximate with an <Ellipse> (shape = 160%/2 × 18%/2 of
// viewport) filled by a circular RadialGradient that fades to transparent
// at 55% of its own radius.
export const DUST_BAND = {
  centerX: 0.30, // fraction of viewport width
  centerY: 0.60, // fraction of viewport height
  cream: {
    // CSS ellipse "160% 18%" → rx = 80% of W, ry = 9% of H
    rxFrac: 0.80,
    ryFrac: 0.09,
    alpha: 0.055,
  },
  warm: {
    // CSS ellipse "160% 10%" → rx = 80% of W, ry = 5% of H
    rxFrac: 0.80,
    ryFrac: 0.05,
    alpha: 0.06,
  },
  /** Stop position where cream/warm have fully faded to transparent. */
  fadeStop: 0.55,
} as const;
