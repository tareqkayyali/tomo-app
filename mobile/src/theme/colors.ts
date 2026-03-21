/**
 * TOMO Color Palette v6 — Brand Kit Aligned
 *
 * Source: tomo_brand_kit.pdf (2026)
 * Dark mode is primary. Single green accent.
 *
 * Core:     Black #0A0A0A · Dark #1A1A1A · Green #2ECC71 · White #FFFFFF
 * Extended: Green Dark #27AE60 · Green Light #58D68D · Charcoal #2D2D2D
 *           Gray #B0B0B0 · Gray Dark #6B6B6B · Gray Light #F5F5F5
 * Semantic: Success #2ECC71 · Warning #F39C12 · Error #E74C3C · Info #3498DB
 *
 * Color Ratio: Dark surfaces 70% · Neutral text 20% · Green accent 10%
 */

// ─── ThemeColors type ────────────────────────────────────────────────

export type ThemeColors = {
  // Core
  background: string;
  backgroundElevated: string;
  accent: string;             // Tomo Green — primary CTA
  accentDark: string;         // Pressed states
  accentLight: string;        // Highlights, progress bars

  // Text
  textPrimary: string;        // Primary text (white on dark)
  textSecondary: string;      // Secondary text, placeholders
  textDisabled: string;       // Disabled states, captions
  textOnAccent: string;       // Text on accent-colored buttons (white)
  textLink: string;           // Tappable text links

  // Borders & Surfaces
  border: string;             // Charcoal #2D2D2D
  borderLight: string;        // Subtle separator
  surface: string;            // Card background (= backgroundElevated)
  inputBackground: string;    // Input fields

  // Semantic
  success: string;
  warning: string;
  error: string;
  info: string;

  // Readiness (derived from semantic)
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

  // Calendar Event Types
  eventTraining: string;
  eventMatch: string;
  eventRecovery: string;
  eventStudyBlock: string;
  eventExam: string;
  eventOther: string;

  // Overlay & Shadow
  overlay: string;
  overlayLight: string;
  shadow: string;
  shadowDark: string;

  // Skeleton
  skeletonBase: string;
  skeletonHighlight: string;

  // Ghost Calendar
  ghostBorder: string;
  ghostBackground: string;
  ghostText: string;

  // ─── Backward Compatibility Aliases ─────────────────────────────
  // These map old token names to new values so existing components
  // don't break. Will be removed in a future cleanup pass.
  accent1: string;
  accent2: string;
  accent1Dark: string;
  accent1Light: string;
  accent2Dark: string;
  accent2Light: string;
  textHeader: string;
  textOnDark: string;
  textOnLight: string;
  textInactive: string;
  textMuted: string;
  cardLight: string;
  cardMuted: string;
  divider: string;
  borderAccent: string;
  glowOrange: string;
  glowCyan: string;
  glass: string;
  glassBorder: string;
  glassHighlight: string;
  surfaceElevated: string;
  chipBackground: string;
  chipText: string;
  navBackground: string;
  gradientOrangeCyan: [string, string];
  gradientOrange: [string, string];
  gradientCyan: [string, string];
  gradientDark: [string, string];
  gradientGlass: [string, string];
  pastelTerracotta: string;
  pastelPeach: string;
  logout: string;
  archetypePhoenix: string;
  archetypeTitan: string;
  archetypeBlade: string;
  archetypeSurge: string;
  tierBronze: string;
  tierBronzeDark: string;
  tierSilver: string;
  tierSilverDark: string;
  tierGold: string;
  tierGoldDark: string;
  tierDiamond: string;
  tierDiamondDark: string;
  tierDiamondBorder: string;
  dnaPower: string;
  dnaReflexes: string;
  dnaControl: string;
  dnaStamina: string;
  dnaAgility: string;
  dnaTactics: string;
  shotExcellent: string;
  shotGood: string;
  shotAverage: string;
  shotDeveloping: string;
  streakBadgeBg: string;
};

// ─── Dark Colors (Brand Kit — primary context) ──────────────────────

export const darkColors: ThemeColors = {
  // Core (Brand Kit)
  background: '#0A0A0A',
  backgroundElevated: '#1A1A1A',
  accent: '#2ECC71',
  accentDark: '#27AE60',
  accentLight: '#58D68D',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textDisabled: '#6B6B6B',
  textOnAccent: '#FFFFFF',
  textLink: '#2ECC71',

  // Borders & Surfaces
  border: '#2D2D2D',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  surface: '#1A1A1A',
  inputBackground: 'rgba(255, 255, 255, 0.06)',

  // Semantic (Brand Kit)
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3498DB',

  // Readiness
  readinessGreen: '#2ECC71',
  readinessYellow: '#F39C12',
  readinessRed: '#E74C3C',
  readinessGreenBg: 'rgba(46, 204, 113, 0.15)',
  readinessYellowBg: 'rgba(243, 156, 18, 0.15)',
  readinessRedBg: 'rgba(231, 76, 60, 0.15)',

  // Intensity
  intensityRest: '#B0B0B0',
  intensityRestBg: 'rgba(176, 176, 176, 0.15)',
  intensityLight: '#58D68D',
  intensityLightBg: 'rgba(88, 214, 141, 0.15)',
  intensityModerate: '#F39C12',
  intensityModerateBg: 'rgba(243, 156, 18, 0.15)',
  intensityHard: '#E74C3C',
  intensityHardBg: 'rgba(231, 76, 60, 0.15)',

  // Calendar Events
  eventTraining: '#2ECC71',
  eventMatch: '#3498DB',
  eventRecovery: '#27AE60',
  eventStudyBlock: '#F39C12',
  eventExam: '#E74C3C',
  eventOther: '#6B6B6B',

  // Overlay & Shadow
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  shadow: 'rgba(0, 0, 0, 0.25)',
  shadowDark: 'rgba(0, 0, 0, 0.50)',

  // Skeleton
  skeletonBase: '#1A1A1A',
  skeletonHighlight: '#2D2D2D',

  // Ghost Calendar
  ghostBorder: 'rgba(255, 255, 255, 0.15)',
  ghostBackground: 'rgba(255, 255, 255, 0.03)',
  ghostText: 'rgba(255, 255, 255, 0.5)',

  // ─── Backward Compatibility Aliases ─────────────────────────────
  accent1: '#2ECC71',            // was orange → now green
  accent2: '#2ECC71',            // was teal → now green
  accent1Dark: '#27AE60',
  accent1Light: '#58D68D',
  accent2Dark: '#27AE60',
  accent2Light: '#58D68D',
  textHeader: '#FFFFFF',
  textOnDark: '#FFFFFF',
  textOnLight: '#FFFFFF',
  textInactive: '#B0B0B0',
  textMuted: '#6B6B6B',
  cardLight: '#1A1A1A',
  cardMuted: 'rgba(26, 26, 26, 0.60)',
  divider: '#2D2D2D',
  borderAccent: 'rgba(46, 204, 113, 0.30)',
  glowOrange: 'rgba(46, 204, 113, 0.20)',  // green glow now
  glowCyan: 'rgba(46, 204, 113, 0.15)',    // green glow now
  glass: '#1A1A1A',              // solid surface, no glass
  glassBorder: '#2D2D2D',
  glassHighlight: 'rgba(255, 255, 255, 0.06)',
  surfaceElevated: '#1A1A1A',
  chipBackground: 'rgba(255, 255, 255, 0.08)',
  chipText: '#2ECC71',
  navBackground: '#0A0A0A',
  gradientOrangeCyan: ['#2ECC71', '#27AE60'],  // green gradient
  gradientOrange: ['#2ECC71', '#58D68D'],
  gradientCyan: ['#27AE60', '#2ECC71'],
  gradientDark: ['#0A0A0A', '#1A1A1A'],
  gradientGlass: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'],
  pastelTerracotta: '#1A2A1A',
  pastelPeach: '#1A2A1A',
  logout: '#E74C3C',
  archetypePhoenix: '#2ECC71',
  archetypeTitan: '#3498DB',
  archetypeBlade: '#58D68D',
  archetypeSurge: '#27AE60',
  tierBronze: '#CD7F32',
  tierBronzeDark: '#8B5E3C',
  tierSilver: '#C0C0C0',
  tierSilverDark: '#808080',
  tierGold: '#FFD700',
  tierGoldDark: '#CCB000',
  tierDiamond: '#B9F2FF',
  tierDiamondDark: '#87D4E8',
  tierDiamondBorder: '#B9F2FF',
  dnaPower: '#2ECC71',
  dnaReflexes: '#3498DB',
  dnaControl: '#27AE60',
  dnaStamina: '#58D68D',
  dnaAgility: '#F39C12',
  dnaTactics: '#3498DB',
  shotExcellent: '#2ECC71',
  shotGood: '#58D68D',
  shotAverage: '#F39C12',
  shotDeveloping: '#3498DB',
  streakBadgeBg: 'rgba(46, 204, 113, 0.15)',
};

// ─── Light Colors (Brand Kit) ────────────────────────────────────────

export const lightColors: ThemeColors = {
  // Core
  background: '#F5F5F5',
  backgroundElevated: '#FFFFFF',
  accent: '#2ECC71',
  accentDark: '#27AE60',
  accentLight: '#58D68D',

  // Text
  textPrimary: '#0A0A0A',
  textSecondary: '#6B6B6B',
  textDisabled: '#B0B0B0',
  textOnAccent: '#FFFFFF',
  textLink: '#2ECC71',

  // Borders & Surfaces
  border: '#E0E0E0',
  borderLight: 'rgba(0, 0, 0, 0.06)',
  surface: '#FFFFFF',
  inputBackground: 'rgba(0, 0, 0, 0.04)',

  // Semantic
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3498DB',

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

  // Calendar Events
  eventTraining: '#2ECC71',
  eventMatch: '#3498DB',
  eventRecovery: '#27AE60',
  eventStudyBlock: '#F39C12',
  eventExam: '#E74C3C',
  eventOther: '#B0B0B0',

  // Overlay & Shadow
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  shadow: 'rgba(0, 0, 0, 0.10)',
  shadowDark: 'rgba(0, 0, 0, 0.20)',

  // Skeleton
  skeletonBase: 'rgba(0, 0, 0, 0.04)',
  skeletonHighlight: 'rgba(0, 0, 0, 0.08)',

  // Ghost Calendar
  ghostBorder: 'rgba(0, 0, 0, 0.12)',
  ghostBackground: 'rgba(0, 0, 0, 0.02)',
  ghostText: 'rgba(0, 0, 0, 0.4)',

  // ─── Backward Compatibility Aliases ─────────────────────────────
  accent1: '#2ECC71',
  accent2: '#2ECC71',
  accent1Dark: '#27AE60',
  accent1Light: '#58D68D',
  accent2Dark: '#27AE60',
  accent2Light: '#58D68D',
  textHeader: '#0A0A0A',
  textOnDark: '#0A0A0A',
  textOnLight: '#0A0A0A',
  textInactive: '#B0B0B0',
  textMuted: '#6B6B6B',
  cardLight: 'rgba(0, 0, 0, 0.04)',
  cardMuted: 'rgba(0, 0, 0, 0.02)',
  divider: '#E0E0E0',
  borderAccent: 'rgba(46, 204, 113, 0.30)',
  glowOrange: 'rgba(46, 204, 113, 0.12)',
  glowCyan: 'rgba(46, 204, 113, 0.10)',
  glass: '#FFFFFF',
  glassBorder: '#E0E0E0',
  glassHighlight: 'rgba(0, 0, 0, 0.06)',
  surfaceElevated: '#FFFFFF',
  chipBackground: 'rgba(0, 0, 0, 0.05)',
  chipText: '#2ECC71',
  navBackground: '#F5F5F5',
  gradientOrangeCyan: ['#2ECC71', '#27AE60'],
  gradientOrange: ['#2ECC71', '#58D68D'],
  gradientCyan: ['#27AE60', '#2ECC71'],
  gradientDark: ['#F5F5F5', '#FFFFFF'],
  gradientGlass: ['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.01)'],
  pastelTerracotta: '#E8F5E9',
  pastelPeach: '#E8F5E9',
  logout: '#E74C3C',
  archetypePhoenix: '#2ECC71',
  archetypeTitan: '#3498DB',
  archetypeBlade: '#58D68D',
  archetypeSurge: '#27AE60',
  tierBronze: '#CD7F32',
  tierBronzeDark: '#8B5E3C',
  tierSilver: '#C0C0C0',
  tierSilverDark: '#808080',
  tierGold: '#FFD700',
  tierGoldDark: '#CCB000',
  tierDiamond: '#B9F2FF',
  tierDiamondDark: '#87D4E8',
  tierDiamondBorder: '#B9F2FF',
  dnaPower: '#2ECC71',
  dnaReflexes: '#3498DB',
  dnaControl: '#27AE60',
  dnaStamina: '#58D68D',
  dnaAgility: '#F39C12',
  dnaTactics: '#3498DB',
  shotExcellent: '#2ECC71',
  shotGood: '#58D68D',
  shotAverage: '#F39C12',
  shotDeveloping: '#3498DB',
  streakBadgeBg: 'rgba(46, 204, 113, 0.10)',
};

// ─── Default export (dark) ──────────────────────────────────────────
export const colors = darkColors;

// ─── Derived color maps ─────────────────────────────────────────────

export const readinessColors: Record<string, string> = {
  Green: colors.readinessGreen,
  Yellow: colors.readinessYellow,
  Red: colors.readinessRed,
};

export const intensityColors: Record<string, string> = {
  rest: colors.intensityRest,
  light: colors.intensityLight,
  moderate: colors.intensityModerate,
  hard: colors.intensityHard,
};

export const archetypeColors: Record<string, string> = {
  phoenix: colors.archetypePhoenix,
  titan: colors.archetypeTitan,
  blade: colors.archetypeBlade,
  surge: colors.archetypeSurge,
};

export const tierGradients: Record<string, [string, string]> = {
  bronze: [colors.tierBronze, colors.tierBronzeDark],
  silver: [colors.tierSilver, colors.tierSilverDark],
  gold: [colors.tierGold, colors.tierGoldDark],
  diamond: [colors.tierDiamond, colors.tierDiamondDark],
};

export const eventTypeColors: Record<string, string> = {
  training: colors.eventTraining,
  match: colors.eventMatch,
  recovery: colors.eventRecovery,
  study_block: colors.eventStudyBlock,
  exam: colors.eventExam,
  other: colors.eventOther,
};

export const dnaAttributeColors: Record<string, string> = {
  power: colors.dnaPower,
  reflexes: colors.dnaReflexes,
  control: colors.dnaControl,
  stamina: colors.dnaStamina,
  agility: colors.dnaAgility,
  tactics: colors.dnaTactics,
};
