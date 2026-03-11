/**
 * Web Font Loader — Poppins + Ionicons for static web exports
 *
 * On web, expo-font's dynamic @font-face injection can fail in static exports.
 * This module injects reliable @font-face rules that map Expo's font family names
 * (e.g., "Poppins_300Light") directly to Google Fonts CDN TTF files, and also
 * loads Ionicons from the bundled asset so icon fonts render correctly.
 *
 * Call `injectWebFonts()` once at app startup (web only).
 */

import { Platform } from 'react-native';

// Ionicons font — import the TTF so the bundler includes it in the output
// and gives us a resolved URL we can use in @font-face
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ioniconsFont = require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');

/**
 * Google Fonts CDN URLs for Poppins — stable, versioned endpoints.
 * These map Expo's font name convention to the correct weight.
 */
const POPPINS_FONTS = [
  {
    family: 'Poppins_300Light',
    weight: 300,
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLDz8V1s.ttf',
  },
  {
    family: 'Poppins_400Regular',
    weight: 400,
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJA.ttf',
  },
  {
    family: 'Poppins_500Medium',
    weight: 500,
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9V1s.ttf',
  },
  {
    family: 'Poppins_600SemiBold',
    weight: 600,
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6V1s.ttf',
  },
  {
    family: 'Poppins_700Bold',
    weight: 700,
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7V1s.ttf',
  },
];

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

  // Build @font-face rules
  const css = POPPINS_FONTS.map(
    (f) => `
@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('${f.url}') format('truetype');
}`,
  ).join('\n');

  // Resolve the Ionicons font URL (bundler gives us a hashed path)
  const ioniconsUrl = typeof ioniconsFont === 'string' ? ioniconsFont
    : (ioniconsFont && ioniconsFont.default) ? ioniconsFont.default
    : ioniconsFont?.uri || '';

  // Global base font + Ionicons icon font
  const globalCss = `
${css}

/* Ionicons icon font — required for @expo/vector-icons on web */
@font-face {
  font-family: 'ionicons';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${ioniconsUrl}') format('truetype');
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
