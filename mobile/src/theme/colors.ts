/**
 * TOMO Color Palette v5
 * Dark + Light mode support
 *
 * Dark: Warm charcoal #0D0C0E bg (slight purple-warm tint),
 *       Tomo Dark #1B191E cards, Charcoal #2E2B31 dividers
 * Light: Warm cream #F8F5F0 bg, elevated #F0EBE3, dark navy #1A1D2E text
 *
 * Primary Accent: Tomo Orange #FF6B35
 * Secondary Accent: Tomo Teal #00D9FF
 * Signature Gradient: Orange #FF6B35 → Teal #00D9FF
 *
 * Extended: Orange Dark #DC5523, Orange Light #FF9664,
 *           Teal Dark #00B4DC, Teal Light #64E8FF
 *
 * Color Ratio: Dark surfaces 70%, Neutral text 20%, Orange-Teal accent 10%
 */

// ─── ThemeColors type ────────────────────────────────────────────────

export type ThemeColors = {
  // Primary Background
  background: string;
  backgroundElevated: string;

  // Accent Colors
  accent1: string;        // Tomo Orange
  accent2: string;        // Tomo Teal

  // Extended Accent Palette
  accent1Dark: string;    // Orange Dark (pressed)
  accent1Light: string;   // Orange Light (highlights)
  accent2Dark: string;    // Teal Dark (pressed)
  accent2Light: string;   // Teal Light (highlights)

  // Card Surfaces
  cardLight: string;
  cardMuted: string;

  // Text Colors
  textHeader: string;
  textOnDark: string;
  textOnLight: string;
  textInactive: string;   // Gray #B0B0B0 / placeholders
  textMuted: string;
  textDisabled: string;   // Gray Dark #6B6B6B

  // Readiness
  readinessGreen: string;
  readinessYellow: string;
  readinessRed: string;
  readinessGreenBg: string;
  readinessYellowBg: string;
  readinessRedBg: string;

  // Intensity
  intensityRest: string;
  intensityRestBg: string;
  intensityLight: string;
  intensityLightBg: string;
  intensityModerate: string;
  intensityModerateBg: string;
  intensityHard: string;
  intensityHardBg: string;

  // Archetypes
  archetypePhoenix: string;
  archetypeTitan: string;
  archetypeBlade: string;
  archetypeSurge: string;

  // UI Elements
  border: string;
  borderLight: string;
  borderAccent: string;
  divider: string;

  // State (Semantic)
  success: string;        // #30D158 — PRs, targets hit
  warning: string;        // #F39C12 — Fatigue alerts
  error: string;          // #E74C3C — Injury risk
  info: string;           // #3498DB — Recovery tips

  // Shadows & Glows
  shadow: string;
  shadowDark: string;
  glowOrange: string;
  glowCyan: string;

  // Overlay
  overlay: string;
  overlayLight: string;

  // Gradients
  gradientOrangeCyan: [string, string];   // Signature gradient
  gradientOrange: [string, string];
  gradientCyan: [string, string];
  gradientDark: [string, string];
  gradientGlass: [string, string];

  // Glass Surfaces
  surfaceElevated: string;
  glass: string;
  glassBorder: string;
  glassHighlight: string;

  // Chat / Input
  chipBackground: string;
  chipText: string;
  inputBackground: string;
  navBackground: string;

  // Skeleton Loading
  skeletonBase: string;
  skeletonHighlight: string;

  // Pastel Stat Cards
  pastelTerracotta: string;
  pastelPeach: string;

  // Logout
  logout: string;

  // DNA Tier Colors (Padel)
  tierBronze: string;         // #CD7F32 (0-299)
  tierBronzeDark: string;
  tierSilver: string;         // #C0C0C0 (300-499)
  tierSilverDark: string;
  tierGold: string;           // #FFD700 (500-699)
  tierGoldDark: string;
  tierDiamond: string;        // #B9F2FF (700-1000)
  tierDiamondDark: string;
  tierDiamondBorder: string;

  // DNA Attribute Colors
  dnaPower: string;
  dnaReflexes: string;
  dnaControl: string;
  dnaStamina: string;
  dnaAgility: string;
  dnaTactics: string;

  // Shot Rating Colors
  shotExcellent: string;
  shotGood: string;
  shotAverage: string;
  shotDeveloping: string;

  // Calendar Event Type Colors
  eventTraining: string;
  eventMatch: string;
  eventRecovery: string;
  eventStudyBlock: string;
  eventExam: string;
  eventOther: string;

  // Ghost Calendar
  ghostBorder: string;
  ghostBackground: string;
  ghostText: string;

  // Planning Streak
  streakBadgeBg: string;
};

// ─── Dark Colors (Tomo brand) ────────────────────────────────────────

export const darkColors: ThemeColors = {
  // Primary Background — warm charcoal (subtle purple-warm tint)
  background: '#0D0C0E',
  backgroundElevated: '#1B191E',       // Tomo Dark (cards, warm tint)

  // Accent Colors
  accent1: '#FF6B35',                   // Tomo Orange
  accent2: '#00D9FF',                   // Tomo Teal

  // Extended Accent Palette
  accent1Dark: '#DC5523',               // Orange Dark (pressed)
  accent1Light: '#FF9664',              // Orange Light (highlights)
  accent2Dark: '#00B4DC',               // Teal Dark (pressed)
  accent2Light: '#64E8FF',              // Teal Light (highlights)

  // Card Surfaces — warm dark at 85% opacity for glass
  cardLight: 'rgba(27, 25, 30, 0.85)',  // #1B191E at 85%
  cardMuted: 'rgba(27, 25, 30, 0.60)',

  // Text Colors — Tomo White on dark
  textHeader: '#FFFFFF',
  textOnDark: '#FFFFFF',
  textOnLight: '#FFFFFF',
  textInactive: '#B0B0B0',              // Gray (placeholders)
  textMuted: '#6B6B6B',                 // Gray Dark (disabled text)
  textDisabled: '#6B6B6B',              // Gray Dark

  // Readiness
  readinessGreen: '#30D158',            // Success green
  readinessYellow: '#F39C12',           // Warning amber
  readinessRed: '#E74C3C',             // Error red
  readinessGreenBg: 'rgba(48, 209, 88, 0.15)',
  readinessYellowBg: 'rgba(243, 156, 18, 0.15)',
  readinessRedBg: 'rgba(231, 76, 60, 0.15)',

  // Intensity
  intensityRest: '#B0B0B0',             // Gray
  intensityRestBg: 'rgba(176, 176, 176, 0.15)',
  intensityLight: '#00D9FF',            // Tomo Teal
  intensityLightBg: 'rgba(0, 217, 255, 0.15)',
  intensityModerate: '#FF6B35',         // Tomo Orange
  intensityModerateBg: 'rgba(255, 107, 53, 0.15)',
  intensityHard: '#E74C3C',            // Error red
  intensityHardBg: 'rgba(231, 76, 60, 0.15)',

  // Archetypes (unchanged)
  archetypePhoenix: '#FF6B35',
  archetypeTitan: '#7B61FF',
  archetypeBlade: '#00D9FF',
  archetypeSurge: '#30D158',

  // UI Elements — warm charcoal for borders/dividers
  border: '#2E2B31',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderAccent: 'rgba(255, 107, 53, 0.30)',
  divider: '#2E2B31',

  // State (Semantic — Tomo brand)
  success: '#30D158',                    // PRs, targets hit
  warning: '#F39C12',                    // Fatigue alerts
  error: '#E74C3C',                     // Injury risk
  info: '#3498DB',                      // Recovery tips

  // Shadows & Glows
  shadow: 'rgba(0, 0, 0, 0.25)',
  shadowDark: 'rgba(0, 0, 0, 0.50)',
  glowOrange: 'rgba(255, 107, 53, 0.25)',
  glowCyan: 'rgba(0, 217, 255, 0.25)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Gradients — Signature: Orange → Teal
  gradientOrangeCyan: ['#FF6B35', '#00D9FF'],
  gradientOrange: ['#FF6B35', '#FF9664'],
  gradientCyan: ['#00D9FF', '#00B4DC'],
  gradientDark: ['#0D0C0E', '#1B191E'],
  gradientGlass: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],

  // Glass Surfaces — Dark mode glass card spec
  surfaceElevated: '#1B191E',
  glass: 'rgba(27, 25, 30, 0.85)',       // warm dark at 85% opacity
  glassBorder: '#2E2B31',
  glassHighlight: 'rgba(255, 255, 255, 0.12)',

  // Chat / Input
  chipBackground: 'rgba(255, 255, 255, 0.08)',
  chipText: '#FF6B35',                   // Tomo Orange
  inputBackground: 'rgba(255, 255, 255, 0.06)',
  navBackground: '#0D0C0E',

  // Skeleton Loading
  skeletonBase: 'rgba(255, 255, 255, 0.04)',
  skeletonHighlight: 'rgba(255, 255, 255, 0.08)',

  // Pastel Stat Cards
  pastelTerracotta: '#2D1A10',
  pastelPeach: '#2D2410',

  // Logout
  logout: '#E74C3C',                    // Error red

  // DNA Tier Colors (Padel)
  tierBronze: '#CD7F32',
  tierBronzeDark: '#8B5E3C',
  tierSilver: '#C0C0C0',
  tierSilverDark: '#808080',
  tierGold: '#FFD700',
  tierGoldDark: '#CCB000',
  tierDiamond: '#B9F2FF',
  tierDiamondDark: '#87D4E8',
  tierDiamondBorder: '#B9F2FF',

  // DNA Attribute Colors
  dnaPower: '#FF6B35',                   // Tomo Orange
  dnaReflexes: '#7B61FF',               // Titan purple
  dnaControl: '#30D158',                // Success green
  dnaStamina: '#00D9FF',                // Tomo Teal
  dnaAgility: '#FF9664',                // Orange Light
  dnaTactics: '#3498DB',                // Info blue

  // Shot Rating Colors
  shotExcellent: '#30D158',
  shotGood: '#F39C12',                   // Warning amber
  shotAverage: '#FF9664',                // Orange Light
  shotDeveloping: '#00D9FF',                  // Teal — growth-oriented, not red

  // Calendar Event Type Colors
  eventTraining: '#FF6B35',              // Tomo Orange
  eventMatch: '#7B61FF',                // Titan purple
  eventRecovery: '#30D158',             // Success green
  eventStudyBlock: '#00D9FF',           // Tomo Teal
  eventExam: '#F39C12',                 // Warning amber
  eventOther: '#B0B0B0',               // Gray

  // Ghost Calendar
  ghostBorder: 'rgba(255, 255, 255, 0.15)',
  ghostBackground: 'rgba(255, 255, 255, 0.03)',
  ghostText: 'rgba(255, 255, 255, 0.5)',

  // Planning Streak
  streakBadgeBg: 'rgba(255, 107, 53, 0.15)',
};

// ─── Light Colors (warm cream — premium, Tomo brand) ─────────────────

export const lightColors: ThemeColors = {
  // Primary Background — deeper warm cream, earthy undertone
  background: '#F8F5F0',
  backgroundElevated: '#F0EBE3',

  // Accent Colors — same vibrant Tomo Orange/Teal
  accent1: '#FF6B35',                    // Tomo Orange
  accent2: '#00D9FF',                    // Tomo Teal (full strength on cream)

  // Extended Accent Palette
  accent1Dark: '#DC5523',
  accent1Light: '#FF9664',
  accent2Dark: '#00B4DC',
  accent2Light: '#64E8FF',

  // Card Surfaces — subtle dark tint on cream
  cardLight: 'rgba(0, 0, 0, 0.04)',
  cardMuted: 'rgba(0, 0, 0, 0.02)',

  // Text Colors — dark navy #1A1D2E for readability
  textHeader: '#1A1D2E',
  textOnDark: '#1A1D2E',
  textOnLight: '#1A1D2E',
  textInactive: '#B0B0B0',              // Gray (placeholders)
  textMuted: '#6B6B6B',                 // Gray Dark
  textDisabled: '#6B6B6B',              // Gray Dark

  // Readiness (semantic — Tomo brand)
  readinessGreen: '#30D158',
  readinessYellow: '#F39C12',
  readinessRed: '#E74C3C',
  readinessGreenBg: 'rgba(48, 209, 88, 0.12)',
  readinessYellowBg: 'rgba(243, 156, 18, 0.12)',
  readinessRedBg: 'rgba(231, 76, 60, 0.12)',

  // Intensity
  intensityRest: '#B0B0B0',
  intensityRestBg: 'rgba(176, 176, 176, 0.10)',
  intensityLight: '#00D9FF',
  intensityLightBg: 'rgba(0, 217, 255, 0.10)',
  intensityModerate: '#FF6B35',
  intensityModerateBg: 'rgba(255, 107, 53, 0.10)',
  intensityHard: '#E74C3C',
  intensityHardBg: 'rgba(231, 76, 60, 0.10)',

  // Archetypes (unchanged)
  archetypePhoenix: '#FF6B35',
  archetypeTitan: '#7B61FF',
  archetypeBlade: '#00D9FF',
  archetypeSurge: '#30D158',

  // UI Elements — warm borders on cream bg
  border: '#E5DFD5',
  borderLight: 'rgba(0, 0, 0, 0.12)',
  borderAccent: 'rgba(255, 107, 53, 0.30)',
  divider: '#E5DFD5',

  // State (Semantic — Tomo brand)
  success: '#30D158',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3498DB',

  // Shadows & Glows — lighter for cream bg
  shadow: 'rgba(0, 0, 0, 0.10)',
  shadowDark: 'rgba(0, 0, 0, 0.20)',
  glowOrange: 'rgba(255, 107, 53, 0.15)',
  glowCyan: 'rgba(0, 217, 255, 0.15)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',

  // Gradients — Signature: Orange → Teal
  gradientOrangeCyan: ['#FF6B35', '#00D9FF'],
  gradientOrange: ['#FF6B35', '#FF9664'],
  gradientCyan: ['#00D9FF', '#00B4DC'],
  gradientDark: ['#F8F5F0', '#F0EBE3'],
  gradientGlass: ['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.01)'],

  // Glass Surfaces — light mode glass card spec
  surfaceElevated: '#F0EBE3',
  glass: 'rgba(248, 245, 240, 0.90)',    // Warm cream at 90%
  glassBorder: '#E5DFD5',
  glassHighlight: 'rgba(0, 0, 0, 0.06)',

  // Chat / Input
  chipBackground: 'rgba(0, 0, 0, 0.05)',
  chipText: '#FF6B35',
  inputBackground: 'rgba(0, 0, 0, 0.04)',
  navBackground: '#F8F5F0',

  // Skeleton Loading
  skeletonBase: 'rgba(0, 0, 0, 0.04)',
  skeletonHighlight: 'rgba(0, 0, 0, 0.08)',

  // Pastel Stat Cards — warm light versions
  pastelTerracotta: '#F5E6DD',
  pastelPeach: '#F5EDDD',

  // Logout
  logout: '#E74C3C',

  // DNA Tier Colors (Padel — same vibrant)
  tierBronze: '#CD7F32',
  tierBronzeDark: '#8B5E3C',
  tierSilver: '#C0C0C0',
  tierSilverDark: '#808080',
  tierGold: '#FFD700',
  tierGoldDark: '#CCB000',
  tierDiamond: '#B9F2FF',
  tierDiamondDark: '#87D4E8',
  tierDiamondBorder: '#B9F2FF',

  // DNA Attribute Colors (same)
  dnaPower: '#FF6B35',
  dnaReflexes: '#7B61FF',
  dnaControl: '#30D158',
  dnaStamina: '#00D9FF',
  dnaAgility: '#FF9664',
  dnaTactics: '#3498DB',

  // Shot Rating Colors
  shotExcellent: '#30D158',
  shotGood: '#F39C12',
  shotAverage: '#FF9664',
  shotDeveloping: '#0097B2',                  // Teal (light mode variant)

  // Calendar Event Type Colors
  eventTraining: '#FF6B35',
  eventMatch: '#7B61FF',
  eventRecovery: '#30D158',
  eventStudyBlock: '#00D9FF',
  eventExam: '#F39C12',
  eventOther: '#B0B0B0',

  // Ghost Calendar
  ghostBorder: 'rgba(0, 0, 0, 0.12)',
  ghostBackground: 'rgba(0, 0, 0, 0.02)',
  ghostText: 'rgba(0, 0, 0, 0.4)',

  // Planning Streak
  streakBadgeBg: 'rgba(255, 107, 53, 0.10)',
};

// ─── Backward-compatible default export (dark) ───────────────────────
// Screens that haven't migrated to useTheme() still get dark colors.
export const colors = darkColors;

// ─── Derived color maps ──────────────────────────────────────────────

/** Readiness level → color mapping */
export const readinessColors: Record<string, string> = {
  Green: colors.readinessGreen,
  Yellow: colors.readinessYellow,
  Red: colors.readinessRed,
};

/** Intensity → color mapping */
export const intensityColors: Record<string, string> = {
  rest: colors.intensityRest,
  light: colors.intensityLight,
  moderate: colors.intensityModerate,
  hard: colors.intensityHard,
};

/** Archetype → color mapping */
export const archetypeColors: Record<string, string> = {
  phoenix: colors.archetypePhoenix,
  titan: colors.archetypeTitan,
  blade: colors.archetypeBlade,
  surge: colors.archetypeSurge,
};

/** DNA Tier gradient pairs */
export const tierGradients: Record<string, [string, string]> = {
  bronze: [colors.tierBronze, colors.tierBronzeDark],
  silver: [colors.tierSilver, colors.tierSilverDark],
  gold: [colors.tierGold, colors.tierGoldDark],
  diamond: [colors.tierDiamond, colors.tierDiamondDark],
};

/** Event type → color mapping */
export const eventTypeColors: Record<string, string> = {
  training: colors.eventTraining,
  match: colors.eventMatch,
  recovery: colors.eventRecovery,
  study_block: colors.eventStudyBlock,
  exam: colors.eventExam,
  other: colors.eventOther,
};

/** DNA Attribute → color mapping */
export const dnaAttributeColors: Record<string, string> = {
  power: colors.dnaPower,
  reflexes: colors.dnaReflexes,
  control: colors.dnaControl,
  stamina: colors.dnaStamina,
  agility: colors.dnaAgility,
  tactics: colors.dnaTactics,
};
