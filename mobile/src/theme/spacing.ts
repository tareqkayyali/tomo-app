/**
 * Tomo Layout & Spacing System
 * 8pt base grid with generous whitespace (minimalist luxury)
 *
 * Reference: Tomo UI Aesthetic Features doc Section 2.3
 *
 * Margins:          20px horizontal screen margins
 * Safe Area:        16px top padding (below status bar)
 * Vertical Rhythm:  16px spacing between cards
 * Internal Padding: 20px standard padding inside cards
 * Grid Unit:        8pt base unit
 */

import { ViewStyle } from 'react-native';

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
};

// ─── Border Radius ─────────────────────────────────────────────────
export const borderRadius = {
  /** 8px — subtle rounding */
  sm: 8,
  /** 12px — buttons */
  md: 12,
  /** 16px — standard cards (Type 2: Rounded Rectangles) */
  lg: 16,
  /** 20px — chat bubbles */
  chat: 20,
  /** 24px — large cards, input pills */
  xl: 24,
  /** 30px — blob card minimum radius */
  blobMin: 30,
  /** 45px — blob card medium radius */
  blobMid: 45,
  /** 60px — blob card maximum radius */
  blobMax: 60,
  /** 9999px — full circle / pill shape */
  full: 9999,
};

// ─── Shadows (Standard iOS Elevation) ──────────────────────────────
export const shadows: Record<string, ViewStyle> = {
  /** Subtle elevation for cards on dark background */
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Standard card shadow: 0px 2px 8px rgba(0,0,0,0.15) */
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Prominent elevation */
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 8,
  },

  // ─── Selective Glow Effects (Critical to Tomo Aesthetic) ─────────
  /**
   * Orange glow — applied to bottom-right of cards (e.g., Streak card)
   * box-shadow: 0px 4px 16px rgba(255, 107, 53, 0.2)
   */
  glowOrange: {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 8,
  },
  /**
   * Cyan glow — applied to top-left of cards (e.g., Sleep card)
   * box-shadow: -4px -4px 16px rgba(0, 217, 255, 0.25)
   */
  glowCyan: {
    shadowColor: '#00D9FF',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Orange glow for avatar rings and #1 leaderboard position */
  glowOrangeRing: {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 20,
    elevation: 10,
  },
  /** Subtle glow for interactive elements on hover/press */
  glowSubtle: {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
};
