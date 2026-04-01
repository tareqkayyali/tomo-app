/**
 * Web Font Loader — Poppins + Ionicons for static web exports
 *
 * On web, expo-font's dynamic @font-face injection can fail in static exports
 * because the bundled TTF assets end up in deep `node_modules/` paths that
 * Vercel (and other hosts) refuse to serve.
 *
 * This module injects reliable @font-face rules:
 *   - Poppins weights → Google Fonts CDN
 *   - Ionicons → /fonts/Ionicons.ttf  (copied to public/ at build time)
 *
 * Call `injectWebFonts()` once at app startup (web only).
 */

import { Platform } from 'react-native';

/**
 * Google Fonts CDN URLs for Poppins — stable, versioned endpoints.
 * These map Expo's font name convention to the correct weight.
 */
const MONTSERRAT_FONTS = [
  {
    family: 'Montserrat_300Light',
    weight: 300,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.ttf',
  },
  {
    family: 'Montserrat_400Regular',
    weight: 400,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w-.ttf',
  },
  {
    family: 'Montserrat_400Regular_Italic',
    weight: 400,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUFjIg1_i6t8kCHKm459Wx7xQYXK0vOoz6jq6R9aX8.ttf',
    style: 'italic',
  },
  {
    family: 'Montserrat_500Medium',
    weight: 500,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvr70w-.ttf',
  },
  {
    family: 'Montserrat_600SemiBold',
    weight: 600,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCsE6Ew-.ttf',
  },
  {
    family: 'Montserrat_700Bold',
    weight: 700,
    url: 'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu96Ew-.ttf',
  },
];

const MONTSERRAT_ALT_FONTS = [
  {
    family: 'MontserratAlternates_500Medium',
    weight: 500,
    url: 'https://fonts.gstatic.com/s/montserratalternates/v17/mFTiWacfw6zH4dthXcyms1lPpC8I_b0juU0xGITFCAY.ttf',
  },
  {
    family: 'MontserratAlternates_600SemiBold',
    weight: 600,
    url: 'https://fonts.gstatic.com/s/montserratalternates/v17/mFTiWacfw6zH4dthXcyms1lPpC8I_b0juU0xNIPFCAY.ttf',
  },
  {
    family: 'MontserratAlternates_700Bold',
    weight: 700,
    url: 'https://fonts.gstatic.com/s/montserratalternates/v17/mFTiWacfw6zH4dthXcyms1lPpC8I_b0juU0xUILFCAY.ttf',
  },
];

/**
 * Ionicons TTF — served from /fonts/Ionicons.ttf via the public/ directory.
 *
 * The exact same TTF from @expo/vector-icons is copied to public/fonts/
 * so it lives at a simple path that all static hosts serve without issue.
 * The bundled asset path (node_modules/...) 404s on Vercel because it
 * strips node_modules paths from static deployments.
 */
const IONICONS_URL = '/fonts/Ionicons.ttf';

let injected = false;

/**
 * Injects @font-face CSS rules into the document head for web.
 * Each rule maps an Expo-style font family name (e.g., "Poppins_700Bold")
 * to the Google Fonts CDN truetype file.
 *
 * Safe to call multiple times — only injects once.
 * No-op on native platforms.
 */
export function injectWebFonts(): void {
  if (Platform.OS !== 'web' || injected) return;
  injected = true;

  // Preconnect to Google Fonts CDN for faster loading
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect);

  // Preload the Ionicons font so the browser fetches it early
  const preloadIonicons = document.createElement('link');
  preloadIonicons.rel = 'preload';
  preloadIonicons.href = IONICONS_URL;
  preloadIonicons.as = 'font';
  preloadIonicons.type = 'font/ttf';
  preloadIonicons.crossOrigin = 'anonymous';
  document.head.appendChild(preloadIonicons);

  // Build @font-face rules for all font families
  const allFonts = [...MONTSERRAT_FONTS, ...MONTSERRAT_ALT_FONTS];
  const fontFaceCss = allFonts.map(
    (f: any) => `
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style || 'normal'};
  font-weight: ${f.weight};
  font-display: swap;
  src: url('${f.url}') format('truetype');
}`,
  ).join('\n');

  // Full CSS: Montserrat + Montserrat Alternates + Ionicons + global smoothing
  const globalCss = `
${fontFaceCss}

/* Ionicons icon font — required for @expo/vector-icons on web */
@font-face {
  font-family: 'ionicons';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${IONICONS_URL}') format('truetype');
}

/* Global web font smoothing & fallback */
html, body, #root, #root > * {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;

  const style = document.createElement('style');
  style.id = 'tomo-web-fonts';
  style.textContent = globalCss;
  document.head.appendChild(style);
}
