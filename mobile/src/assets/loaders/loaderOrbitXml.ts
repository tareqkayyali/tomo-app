/**
 * Inline XML for the Tomo Orbit loader.
 *
 * The source asset lives next to this file at loader-orbit.svg (stable
 * path for the design system). This module re-exports the same markup
 * as a string so <SvgXml /> can render it in React Native without a
 * metro SVG transformer. Keep the two in sync — edit the .svg, then
 * paste the result here (the exact bytes, no reformatting).
 *
 * Animation is NOT baked into the XML. The source asset is static; the
 * <Loader /> component rotates the whole thing via Animated.View, which
 * is equivalent to rotating the arc groups since they share the SVG's
 * center — and keeps parity with web (no SMIL / no CSS keyframes in the
 * SVG itself).
 */
export const ORBIT_LOADER_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="72" height="72" role="img" aria-label="Loading">
  <defs>
    <radialGradient id="orb-sphere" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#C8DCC3"></stop>
      <stop offset="35%" stop-color="#9AB896"></stop>
      <stop offset="75%" stop-color="#7A9B76"></stop>
      <stop offset="100%" stop-color="#5E7A5B"></stop>
    </radialGradient>
    <radialGradient id="orb-hl" cx="35%" cy="28%" r="30%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"></stop>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
    </radialGradient>
    <filter id="orb-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.9"></feGaussianBlur>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="44" fill="none" stroke="#F5F3ED" stroke-opacity="0.12" stroke-width="0.6"></circle>
  <g style="transform-origin: 50px 50px;">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#9AB896" stroke-opacity="0.25" stroke-width="0.9" stroke-linecap="round" stroke-dasharray="46.08 276.46"></circle>
  </g>
  <g>
    <circle cx="50" cy="50" r="44" fill="none" stroke="#9AB896" stroke-opacity="0.35" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="84.47 276.46" filter="url(#orb-glow)"></circle>
    <circle cx="50" cy="50" r="44" fill="none" stroke="#9AB896" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="84.47 276.46"></circle>
  </g>
  <circle cx="50" cy="50" r="26" fill="url(#orb-sphere)"></circle>
  <circle cx="50" cy="50" r="26" fill="url(#orb-hl)"></circle>
</svg>`;
