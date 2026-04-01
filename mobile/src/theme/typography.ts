/**
 * TOMO Typography System
 * Font: Poppins (geometric sans-serif)
 * Font stack (web fallback): 'Poppins', -apple-system, 'Segoe UI', Roboto, sans-serif
 *
 * Type Scale:
 * Style        | Weight          | Size  | Letter Spacing | Usage
 * -------------|-----------------|-------|----------------|------
 * Display      | Bold (700)      | 36px  | -0.02em        | Hero headlines, splash
 * H1 Heading   | Bold (700)      | 24px  | -0.02em        | Page titles, major sections
 * H2 Heading   | Medium (500)    | 18px  | -0.02em        | Section headers, card titles
 * H3 Heading   | Medium (500)    | 14px  | -0.02em        | Subsections, labels
 * Body         | Regular (400)   | 12px  | 0              | Content, descriptions
 * Body Light   | Light (300)     | 11px  | 0              | Secondary text, metadata
 * Caption      | Regular (400)   | 10px  | 0              | Footnotes, timestamps
 * Button/CTA   | Medium (500)    | 10px  | +0.08em        | All caps, +2% letter tracking
 *
 * Additional letter spacing tokens:
 *   Headlines: -0.02em
 *   Body: 0
 *   Buttons: +0.08em
 *   Tagline: +0.15em
 */

import { TextStyle } from 'react-native';
import { darkColors, type ThemeColors } from './colors';

/**
 * Font family constants — loaded in App.tsx via @expo-google-fonts/*
 * React Native requires exact font names matching the loaded font assets.
 *
 * 3-font system ("Coach in Your Pocket" direction):
 *   display + note = handwritten personality (Kalam + Architects Daughter)
 *   light..bold    = clean body text (Poppins)
 */
export const fontFamily = {
  /** Montserrat Alternates 700 — clean geometric display for greetings, scores, section titles */
  display: 'MontserratAlternates_700Bold',
  /** Montserrat Alternates 500 — lighter display for signatures, labels */
  displayMedium: 'MontserratAlternates_500Medium',
  /** Montserrat Alternates 600 — semi-bold display variant */
  displaySemiBold: 'MontserratAlternates_600SemiBold',
  /** @deprecated Use displayMedium instead */
  displayRegular: 'MontserratAlternates_500Medium',
  /** Montserrat Italic — coach notes and subtitles (replaces handwritten note font) */
  note: 'Montserrat_400Regular_Italic',
  /** Montserrat body weights */
  light: 'Montserrat_300Light',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

/**
 * Letter spacing tokens (em values converted to px approximations)
 * React Native letterSpacing is in absolute pixels, not em.
 * Conversions are based on each style's font size.
 */
const letterSpacing = {
  /** -0.02em — used for headlines */
  headlineDisplay: -0.02 * 36, // -0.72
  headlineH1: -0.02 * 24, // -0.48
  headlineH2: -0.02 * 18, // -0.36
  headlineH3: -0.02 * 14, // -0.28
  /** 0 — used for body text */
  body: 0,
  /** +0.08em at 10px — used for buttons/CTAs */
  button: 0.08 * 10, // 0.8
  /** +0.15em — used for taglines/wordmarks */
  tagline: 0.15 * 16, // 2.4
} as const;

/** Create themed typography styles */
export function createTypography(colors: ThemeColors): Record<string, TextStyle> {
  return {
    // ─── Display (Bold 36px) — Hero headlines, splash ──────────────
    display: {
      fontFamily: fontFamily.bold,
      fontSize: 36,
      lineHeight: 43,
      color: colors.textHeader,
      letterSpacing: letterSpacing.headlineDisplay,
    },

    // ─── Page Headers (aliases for display/h1) ─────────────────────
    pageHeader: {
      fontFamily: fontFamily.bold,
      fontSize: 36,
      lineHeight: 43,
      color: colors.textHeader,
      letterSpacing: letterSpacing.headlineDisplay,
    },
    pageHeaderSmall: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      lineHeight: 29,
      color: colors.textHeader,
      letterSpacing: letterSpacing.headlineH1,
    },

    // ─── H1 Heading (Bold 24px) — Page titles, major sections ──────
    h1: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      lineHeight: 29,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.headlineH1,
    },

    // ─── H2 Heading (Medium 18px) — Section headers, card titles ───
    h2: {
      fontFamily: fontFamily.medium,
      fontSize: 18,
      lineHeight: 22,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.headlineH2,
    },

    // ─── H3 Heading (Medium 14px) — Subsections, labels ────────────
    h3: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      lineHeight: 17,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.headlineH3,
    },

    // ─── H4 (kept for backward compat, maps to H3 scale) ──────────
    h4: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      lineHeight: 17,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.headlineH3,
    },

    // ─── Data & Numbers ────────────────────────────────────────────
    dataLarge: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      lineHeight: 29,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.headlineH1,
    },
    dataMedium: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      lineHeight: 22,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.headlineH2,
    },
    stat: {
      fontFamily: fontFamily.bold,
      fontSize: 36,
      lineHeight: 43,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.headlineDisplay,
    },
    statSmall: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      lineHeight: 29,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.headlineH1,
    },

    // ─── Body (Regular 12px) — Content, descriptions ───────────────
    body: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.body,
    },
    bodyLarge: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.body,
    },
    bodyOnDark: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.body,
    },

    // ─── Body Light (Light 11px) — Secondary text, metadata ────────
    bodyLight: {
      fontFamily: fontFamily.light,
      fontSize: 11,
      lineHeight: 17,
      color: colors.textInactive,
      letterSpacing: letterSpacing.body,
    },

    // ─── Metadata (Light 11px) — Dates, subtitles, helper ─────────
    metadata: {
      fontFamily: fontFamily.light,
      fontSize: 11,
      lineHeight: 17,
      color: colors.textInactive,
      letterSpacing: letterSpacing.body,
    },
    metadataSmall: {
      fontFamily: fontFamily.light,
      fontSize: 10,
      lineHeight: 15,
      color: colors.textInactive,
      letterSpacing: letterSpacing.body,
    },

    // ─── Labels (Medium 14px — H3 scale) ───────────────────────────
    label: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      lineHeight: 17,
      color: colors.textInactive,
      letterSpacing: letterSpacing.headlineH3,
    },
    labelLarge: {
      fontFamily: fontFamily.medium,
      fontSize: 18,
      lineHeight: 22,
      color: colors.textInactive,
      letterSpacing: letterSpacing.headlineH2,
    },
    labelOnDark: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      lineHeight: 17,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.headlineH3,
    },

    // ─── Caption (Regular 10px) — Footnotes, timestamps ────────────
    caption: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      lineHeight: 15,
      color: colors.textMuted,
      letterSpacing: letterSpacing.body,
    },

    // ─── Button/CTA (Medium 10px) — All caps, +0.08em tracking ────
    button: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      lineHeight: 15,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.button,
      textTransform: 'uppercase',
    },
    buttonSmall: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      lineHeight: 15,
      color: colors.textOnDark,
      letterSpacing: letterSpacing.button,
      textTransform: 'uppercase',
    },

    // ─── Wordmark / Tagline (+0.15em tracking) ─────────────────────
    wordmark: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 22,
      color: colors.accent,
      letterSpacing: letterSpacing.tagline,
    },

    // ─── Chat Bubbles (Body scale) ─────────────────────────────────
    chatBody: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.body,
    },
    chatPlaceholder: {
      fontFamily: fontFamily.light,
      fontSize: 11,
      lineHeight: 17,
      color: colors.textInactive,
      letterSpacing: letterSpacing.body,
    },

    // ─── Coach UI Styles ("Coach in Your Pocket") ──────────────────
    /** "Hey Tareq," — warm handwritten greeting */
    coachGreeting: {
      fontFamily: fontFamily.display,
      fontSize: 28,
      lineHeight: 34,
      color: colors.textPrimary,
    },
    /** Coach readiness message, recommendation notes */
    coachNote: {
      fontFamily: fontFamily.note,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    /** "— Tomo" signoff */
    coachSignature: {
      fontFamily: fontFamily.displayRegular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.accent1,
    },
    /** "Your 7 Pillars" section headers */
    sectionTitle: {
      fontFamily: fontFamily.display,
      fontSize: 22,
      lineHeight: 28,
      color: colors.textPrimary,
    },
    /** Pillar score numbers (82, 71, etc.) */
    pillarScore: {
      fontFamily: fontFamily.display,
      fontSize: 22,
      color: colors.textPrimary,
    },
    /** Pillar subtitles ("Keep your engine running") */
    pillarSubtitle: {
      fontFamily: fontFamily.note,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    /** Tab bar labels */
    tabLabel: {
      fontFamily: fontFamily.note,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    /** Readiness status text ("Good to go") */
    readinessStatus: {
      fontFamily: fontFamily.display,
      fontSize: 20,
      lineHeight: 26,
    },

    // ─── Legacy aliases (backward compat) ──────────────────────────
    bodySmall: {
      fontFamily: fontFamily.light,
      fontSize: 11,
      lineHeight: 17,
      color: colors.textInactive,
      letterSpacing: letterSpacing.body,
    },
    bodyMedium: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textOnLight,
      letterSpacing: letterSpacing.body,
    },
  };
}

/** Static dark-mode typography (backward compatible) */
export const typography = createTypography(darkColors);
