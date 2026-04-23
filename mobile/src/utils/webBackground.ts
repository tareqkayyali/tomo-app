/**
 * Web dark-surface background — deep space viewed from far away.
 *
 * Pure CSS, applied once to `html, body` as a single layered `background`
 * declaration with `background-attachment: fixed`. Three layers on top of
 * the ink base color: starfield + cream dust wash + warm amber core. All
 * spec values (positions, sizes, alphas, ellipse dimensions) come from
 * theme/backgroundSpec.ts so the native SVG port renders identically.
 *
 * The RN-Web root wrappers are made transparent here too so the body
 * gradient shows through every screen. Not intended for modals, inputs,
 * or dense component surfaces — those keep solid ink via theme tokens.
 *
 * No-op on native platforms.
 */
import { Platform } from 'react-native';
import { CLAY_RGB, CREAM_RGB, DUST_BAND, INK, STARS } from '../theme/backgroundSpec';

function buildBackgroundLayers(): string {
  const stars = STARS.map(
    (s) =>
      `radial-gradient(circle ${s.size}px at ${s.x}% ${s.y}%, rgba(${CREAM_RGB},${s.alpha}), transparent 100%)`,
  );
  // CSS equivalents of the spec: "ellipse 160% 18%" = rx 80% ry 9% but
  // CSS gradient sizing uses full diameters (160% 18%). fadeStop 0.55.
  const creamDiam = `${DUST_BAND.cream.rxFrac * 200}% ${DUST_BAND.cream.ryFrac * 200}%`;
  const warmDiam = `${DUST_BAND.warm.rxFrac * 200}% ${DUST_BAND.warm.ryFrac * 200}%`;
  const cx = `${DUST_BAND.centerX * 100}%`;
  const cy = `${DUST_BAND.centerY * 100}%`;
  const stopPct = `${DUST_BAND.fadeStop * 100}%`;
  const creamWash = `radial-gradient(ellipse ${creamDiam} at ${cx} ${cy}, rgba(${CREAM_RGB},${DUST_BAND.cream.alpha}), transparent ${stopPct})`;
  const warmCore = `radial-gradient(ellipse ${warmDiam} at ${cx} ${cy}, rgba(${CLAY_RGB},${DUST_BAND.warm.alpha}), transparent ${stopPct})`;
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
