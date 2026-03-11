/**
 * TOMO Color Palette v6 — Brand Kit 2026
 * Dark + Light mode support
 *
 * Dark: Tomo Black #0A0A0A bg, Tomo Dark #1A1A1A cards, Charcoal #2D2D2D dividers
 * Light: Gray Light #F5F5F5 bg, elevated #EBEBEB, Tomo Black #0A0A0A text
 *
 * Primary Accent: Tomo Green #2ECC71 (sole accent color per brand guidelines)
 * Extended: Green Dark #27AE60, Green Light #58D68D
 *
 * Semantic: Success #2ECC71, Warning #F39C12, Error #E74C3C, Info #3498DB
 *
 * Color Ratio: Dark surfaces 70%, Neutral text 20%, Green accent 10%
 */

// ─── ThemeColors type ────────────────────────────────────────────────

export type ThemeColors = {
  // Primary Background
  background: string;
  backgroundElevated: string;

  // Accent Colors
  accent1: string;        // Tomo Green
  accent2: string;        // Info Blue (secondary data viz)

  // Extended Accent Palette
  accent1Dark: string;    // Green Dark (pressed)
  accent1Light: string;   // Green Light (highlights)
  accent2Dark: string;    // Blue Dark (pressed)
  accent2Light: string;   // Blue Light (highlights)

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
  success: string;        // #2ECC71 — PRs, targets hit
  warning: string;        // #F39C12 — Fatigue alerts
  error: string;          // #E74C3C — Injury risk
  info: string;           // #3498DB — Recovery tips

  // Shadows & Glows
  shadow: string;
  shadowDark: string;
  glowOrange: string;     // Now Tomo Green glow (kept name for compat)
  glowCyan: string;       // Now Info Blue glow (kept name for compat)

  // Overlay
  overlay: string;
  overlayLight: string;

  // Gradients
  gradientOrangeCyan: [string, string];   // Signature gradient (now green)
  gradientOrange: [string, string];       // Primary gradient (now green)
  gradientCyan: [string, string];         // Secondary gradient (now blue)
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
  tierBronze: string;
  tierBronzeDark: string;
  tierSilver: string;
  tierSilverDark: string;
  tierGold: string;
  tierGoldDark: string;
  tierDiamond: string;
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

// ─── Dark Colors (Tomo Brand Kit 2026) ──────────────────────────────

export const darkColors: ThemeColors = {
  // Primary Background — Tomo Black
  background: '#0A0A0A',
  backgroundElevated: '#1A1A1A',         // Tomo Dark (cards, elevated surfaces)

  // Accent Colors — Tomo Green (sole accent per brand guidelines)
  accent1: '#2ECC71',                     // Tomo Green
  accent2: '#3498DB',                     // Info Blue (secondary data viz)

  // Extended Accent Palette
  accent1Dark: '#27AE60',                 // Green Dark (pressed states, borders)
  accent1Light: '#58D68D',               // Green Light (highlights, progress bars)
  accent2Dark: '#2980B9',                 // Blue Dark (pressed)
  accent2Light: '#5DADE2',               // Blue Light (highlights)

  // Card Surfaces — Tomo Dark at 85% opacity for glass
  cardLight: 'rgba(26, 26, 26, 0.85)',   // #1A1A1A at 85%
  cardMuted: 'rgba(26, 26, 26, 0.60)',

  // Text Colors — Tomo White on dark
  textHeader: '#FFFFFF',
  textOnDark: '#FFFFFF',
  textOnLight: '#FFFFFF',
  textInactive: '#B0B0B0',               // Gray (placeholders)
  textMuted: '#6B6B6B',                  // Gray Dark (disabled text)
  textDisabled: '#6B6B6B',               // Gray Dark

  // Readiness
  readinessGreen: '#2ECC71',             // Tomo Green
  readinessYellow: '#F39C12',            // Warning amber
  readinessRed: '#E74C3C',              // Error red
  readinessGreenBg: 'rgba(46, 204, 113, 0.15)',
  readinessYellowBg: 'rgba(243, 156, 18, 0.15)',
  readinessRedBg: 'rgba(231, 76, 60, 0.15)',

  // Intensity
  intensityRest: '#B0B0B0',              // Gray
  intensityRestBg: 'rgba(176, 176, 176, 0.15)',
  intensityLight: '#58D68D',             // Green Light
  intensityLightBg: 'rgba(88, 214, 141, 0.15)',
  intensityModerate: '#F39C12',          // Warning amber
  intensityModerateBg: 'rgba(243, 156, 18, 0.15)',
  intensityHard: '#E74C3C',             // Error red
  intensityHardBg: 'rgba(231, 76, 60, 0.15)',

  // Archetypes
  archetypePhoenix: '#2ECC71',           // Tomo Green
  archetypeTitan: '#7B61FF',             // Purple
  archetypeBlade: '#3498DB',             // Info Blue
  archetypeSurge: '#58D68D',             // Green Light

  // UI Elements — Charcoal for borders/dividers
  border: '#2D2D2D',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderAccent: 'rgba(46, 204, 113, 0.30)',
  divider: '#2D2D2D',

  // State (Semantic — per Brand Kit)
  success: '#2ECC71',                     // Tomo Green — PRs, targets hit
  warning: '#F39C12',                     // Fatigue alerts
  error: '#E74C3C',                      // Injury risk
  info: '#3498DB',                       // Recovery tips

  // Shadows & Glows — Green replaces Orange
  shadow: 'rgba(0, 0, 0, 0.25)',
  shadowDark: 'rgba(0, 0, 0, 0.50)',
  glowOrange: 'rgba(46, 204, 113, 0.25)',  // Tomo Green glow
  glowCyan: 'rgba(52, 152, 219, 0.25)',    // Info Blue glow

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Gradients — Signature: Green → Green Light
  gradientOrangeCyan: ['#2ECC71', '#58D68D'],
  gradientOrange: ['#2ECC71', '#58D68D'],
  gradientCyan: ['#3498DB', '#5DADE2'],
  gradientDark: ['#0A0A0A', '#1A1A1A'],
  gradientGlass: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],

  // Glass Surfaces — Dark mode glass card spec
  surfaceElevated: '#1A1A1A',
  glass: 'rgba(26, 26, 26, 0.85)',
  glassBorder: '#2D2D2D',
  glassHighlight: 'rgba(255, 255, 255, 0.12)',

  // Chat / Input
  chipBackground: 'rgba(255, 255, 255, 0.08)',
  chipText: '#2ECC71',                    // Tomo Green
  inputBackground: 'rgba(255, 255, 255, 0.06)',
  navBackground: '#0A0A0A',

  // Skeleton Loading
  skeletonBase: 'rgba(255, 255, 255, 0.04)',
  skeletonHighlight: 'rgba(255, 255, 255, 0.08)',

  // Pastel Stat Cards — dark green variants
  pastelTerracotta: '#0D2D1A',
  pastelPeach: '#1A2D10',

  // Logout
  logout: '#E74C3C',                     // Error red

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
  dnaPower: '#2ECC71',                    // Tomo Green
  dnaReflexes: '#7B61FF',               // Purple
  dnaControl: '#58D68D',                 // Green Light
  dnaStamina: '#3498DB',                 // Info Blue
  dnaAgility: '#F39C12',                 // Warning amber
  dnaTactics: '#5DADE2',                 // Blue Light

  // Shot Rating Colors
  shotExcellent: '#2ECC71',              // Tomo Green
  shotGood: '#F39C12',                    // Warning amber
  shotAverage: '#58D68D',                // Green Light
  shotDeveloping: '#3498DB',             // Info Blue

  // Calendar Event Type Colors
  eventTraining: '#2ECC71',              // Tomo Green
  eventMatch: '#7B61FF',                 // Purple
  eventRecovery: '#58D68D',              // Green Light
  eventStudyBlock: '#3498DB',            // Info Blue
  eventExam: '#F39C12',                  // Warning amber
  eventOther: '#B0B0B0',                // Gray

  // Ghost Calendar
  ghostBorder: 'rgba(255, 255, 255, 0.15)',
  ghostBackground: 'rgba(255, 255, 255, 0.03)',
  ghostText: 'rgba(255, 255, 255, 0.5)',

  // Planning Streak
  streakBadgeBg: 'rgba(46, 204, 113, 0.15)',
};

// ─── Light Colors (Brand Kit 2026) ──────────────────────────────────

export const lightColors: ThemeColors = {
  // Primary Background — Gray Light
  background: '#F5F5F5',
  backgroundElevated: '#EBEBEB',

  // Accent Colors — Tomo Green (sole accent)
  accent1: '#2ECC71',                     // Tomo Green
  accent2: '#3498DB',                     // Info Blue

  // Extended Accent Palette
  accent1Dark: '#27AE60',
  accent1Light: '#58D68D',
  accent2Dark: '#2980B9',
  accent2Light: '#5DADE2',

  // Card Surfaces — subtle dark tint on light bg
  cardLight: 'rgba(0, 0, 0, 0.04)',
  cardMuted: 'rgba(0, 0, 0, 0.02)',

  // Text Colors — Tomo Black for readability
  textHeader: '#0A0A0A',
  textOnDark: '#0A0A0A',
  textOnLight: '#0A0A0A',
  textInactive: '#B0B0B0',               // Gray (placeholders)
  textMuted: '#6B6B6B',                  // Gray Dark
  textDisabled: '#6B6B6B',               // Gray Dark

  // Readiness
  readinessGreen: '#2ECC71',
  readinessYellow: '#F39C12',
  readinessRed: '#E74C3C',
  readinessGreenBg: 'rgba(46, 204, 113, 0.12)',
  readinessYellowBg: 'rgba(243, 156, 18, 0.12)',
  readinessRedBg: 'rgba(231, 76, 60, 0.12)',

  // Intensity
  intensityRest: '#B0B0B0',
  intensityRestBg: 'rgba(176, 176, 176, 0.10)',
  intensityLight: '#58D68D',
  intensityLightBg: 'rgba(88, 214, 141, 0.10)',
  intensityModerate: '#F39C12',
  intensityModerateBg: 'rgba(243, 156, 18, 0.10)',
  intensityHard: '#E74C3C',
  intensityHardBg: 'rgba(231, 76, 60, 0.10)',

  // Archetypes
  archetypePhoenix: '#2ECC71',
  archetypeTitan: '#7B61FF',
  archetypeBlade: '#3498DB',
  archetypeSurge: '#27AE60',

  // UI Elements — light borders
  border: '#E0E0E0',
  borderLight: 'rgba(0, 0, 0, 0.12)',
  borderAccent: 'rgba(46, 204, 113, 0.30)',
  divider: '#E0E0E0',

  // State (Semantic — per Brand Kit)
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3498DB',

  // Shadows & Glows — lighter for light bg
  shadow: 'rgba(0, 0, 0, 0.10)',
  shadowDark: 'rgba(0, 0, 0, 0.20)',
  glowOrange: 'rgba(46, 204, 113, 0.15)',
  glowCyan: 'rgba(52, 152, 219, 0.15)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',

  // Gradients — Green
  gradientOrangeCyan: ['#2ECC71', '#58D68D'],
  gradientOrange: ['#2ECC71', '#58D68D'],
  gradientCyan: ['#3498DB', '#5DADE2'],
  gradientDark: ['#F5F5F5', '#EBEBEB'],
  gradientGlass: ['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.01)'],

  // Glass Surfaces — light mode glass card spec
  surfaceElevated: '#EBEBEB',
  glass: 'rgba(245, 245, 245, 0.90)',
  glassBorder: '#E0E0E0',
  glassHighlight: 'rgba(0, 0, 0, 0.06)',

  // Chat / Input
  chipBackground: 'rgba(0, 0, 0, 0.05)',
  chipText: '#2ECC71',
  inputBackground: 'rgba(0, 0, 0, 0.04)',
  navBackground: '#F5F5F5',

  // Skeleton Loading
  skeletonBase: 'rgba(0, 0, 0, 0.04)',
  skeletonHighlight: 'rgba(0, 0, 0, 0.08)',

  // Pastel Stat Cards — light green variants
  pastelTerracotta: '#DDF5E6',
  pastelPeach: '#E6F5DD',

  // Logout
  logout: '#E74C3C',

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
  dnaPower: '#2ECC71',
  dnaReflexes: '#7B61FF',
  dnaControl: '#27AE60',
  dnaStamina: '#3498DB',
  dnaAgility: '#F39C12',
  dnaTactics: '#2980B9',

  // Shot Rating Colors
  shotExcellent: '#2ECC71',
  shotGood: '#F39C12',
  shotAverage: '#58D68D',
  shotDeveloping: '#3498DB',

  // Calendar Event Type Colors
  eventTraining: '#2ECC71',
  eventMatch: '#7B61FF',
  eventRecovery: '#58D68D',
  eventStudyBlock: '#3498DB',
  eventExam: '#F39C12',
  eventOther: '#B0B0B0',

  // Ghost Calendar
  ghostBorder: 'rgba(0, 0, 0, 0.12)',
  ghostBackground: 'rgba(0, 0, 0, 0.02)',
  ghostText: 'rgba(0, 0, 0, 0.4)',

  // Planning Streak
  streakBadgeBg: 'rgba(46, 204, 113, 0.10)',
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
