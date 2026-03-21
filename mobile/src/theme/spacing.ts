/**
 * Tomo Layout & Spacing System — Brand Kit Aligned
 * 8pt base grid · 16px card padding · 8px card radius
 *
 * Source: tomo_brand_kit.pdf Section 07 (Component Patterns)
 * Cards: 8px radius · #1A1A1A bg · 1px #2D2D2D border · 16px padding
 */

import { ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

// ─── 8pt Grid Spacing ──────────────────────────────────────────────
export const spacing = {
  /** 4px — hairline gaps */
  xs: 4,
  /** 8px — tight spacing (1 grid unit) */
  sm: 8,
  /** 12px — compact spacing (1.5 grid units) */
  compact: 12,
  /** 16px — standard vertical rhythm between cards */
  md: 16,
  /** 20px — screen margins & card internal padding */
  lg: 20,
  /** 24px — section gaps */
  xl: 24,
  /** 32px — large section gaps */
  xxl: 32,
  /** 40px — hero spacing */
  xxxl: 40,
  /** 48px — major sections */
  huge: 48,
  /** 80px — special (e.g., suggestion chips below logo) */
  heroOffset: 80,
};

/** Common layout values from the design spec */
export const layout = {
  /** 20px horizontal screen margins */
  screenMargin: 20,
  /** 16px vertical spacing between cards */
  cardGap: 16,
  /** 20px padding inside cards */
  cardPadding: 20,
  /** 16px top padding below status bar */
  safeAreaTop: 16,
  /** 80px bottom nav height (inclusive of safe area) */
  navHeight: 80,
  /** 24px icon size for nav icons */
  navIconSize: 24,
  /** 44px minimum tap target */
  tapTarget: 44,
  /** 120px profile avatar diameter */
  avatarLarge: 120,
  /** 60px from top for centered wordmark */
  headerOffset: 60,
  /** 480px max content width for auth/onboarding screens on web */
  authMaxWidth: 480,
};

// ─── Border Radius (Brand Kit: 8px cards, 12px buttons) ────────────
export const borderRadius = {
  /** 8px — standard cards (Brand Kit default) */
  sm: 8,
  /** 12px — buttons */
  md: 12,
  /** 16px — large cards */
  lg: 16,
  /** 20px — chat bubbles */
  chat: 20,
  /** 24px — input pills */
  xl: 24,
  /** @deprecated Use sm (8) instead */
  blobMin: 8,
  /** @deprecated Use sm (8) instead */
  blobMid: 8,
  /** @deprecated Use sm (8) instead */
  blobMax: 8,
  /** 9999px — full circle / pill shape */
  full: 9999,
};

// ─── Shadows (Standard iOS Elevation) ──────────────────────────────
export const shadows: Record<string, ViewStyle> = {
  /** Subtle elevation for cards on dark background */
  sm: {
    shadowColor: colors.background,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Standard card shadow: 0px 2px 8px rgba(0,0,0,0.15) */
  md: {
    shadowColor: colors.background,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Prominent elevation */
  lg: {
    shadowColor: colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 8,
  },

  // ─── Accent Glow (Brand Kit: subtle green accent shadow) ──────────
  /** @deprecated — Brand Kit says no glow effects. Kept as subtle green for compat. */
  glowOrange: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  /** @deprecated — Use md shadow instead */
  glowCyan: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  /** @deprecated — Use md shadow instead */
  glowOrangeRing: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  /** Subtle accent glow for interactive elements */
  glowSubtle: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
};
