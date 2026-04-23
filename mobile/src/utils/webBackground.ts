/**
 * Web dark-surface background — deep space viewed from far away.
 *
 * Pure CSS, applied once to `html, body` as a single layered `background`
 * declaration with `background-attachment: fixed`. Three layers on top of
 * the ink base color (#12141F):
 *   1. Sparse starfield — 30 deterministic pinpricks (0.8px, 15% at 1.4px).
 *   2. Cream dust wash — wide shallow horizontal ellipse at 30% 60%.
 *   3. Warm amber-gold accent core — same position, narrower.
 *
 * The RN-Web root wrappers are made transparent here too so the body
 * gradient shows through every screen. Not intended for modals, inputs,
 * or dense component surfaces — those keep solid ink via theme tokens.
 *
 * No-op on native platforms.
 */
import { Platform } from 'react-native';

const INK = '#12141F';
const CREAM = '245,243,237';
const CLAY = '200,162,122';

type Star = { x: number; y: number; size: 0.8 | 1.4; alpha: number };

// Deterministic hand-placed positions. ~30 stars, 4 larger (13%),
// density clusters around the 55-65% vertical band where dust sits.
const STARS: readonly Star[] = [
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

function buildBackgroundLayers(): string {
  const stars = STARS.map(
    (s) =>
      `radial-gradient(circle ${s.size}px at ${s.x}% ${s.y}%, rgba(${CREAM},${s.alpha}), transparent 100%)`,
  );
  const creamWash = `radial-gradient(ellipse 160% 18% at 30% 60%, rgba(${CREAM},0.055), transparent 55%)`;
  const warmCore = `radial-gradient(ellipse 160% 10% at 30% 60%, rgba(${CLAY},0.06), transparent 55%)`;
  return [...stars, creamWash, warmCore].join(',\n    ');
}

let injected = false;

export function injectWebBackground(): void {
  if (Platform.OS !== 'web' || injected) return;
  if (typeof document === 'undefined') return;
  injected = true;

  const css = `
html, body {
  margin: 0;
  min-height: 100vh;
  background-color: ${INK};
  background-image:
    ${buildBackgroundLayers()};
  background-attachment: fixed;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}

#root {
  background-color: transparent !important;
}
`;

  const style = document.createElement('style');
  style.id = 'tomo-web-background';
  style.textContent = css;
  document.head.appendChild(style);
}
