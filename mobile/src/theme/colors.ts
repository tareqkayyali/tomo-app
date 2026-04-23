/**
 * TOMO Color Palette v8 — Japanese 4-Color (Kon/Kinari/Moegi/Blue-Gray)
 *
 * 1. #12141F — Deep indigo (Kon 紺) — ALL backgrounds
 * 2. #F5F3ED — Warm cream (Kinari 生成) — ALL text
 * 3. #7A9B76 — Moegi sage green (萌黄) — ALL accents
 * 4. #7A8A9A — Muted blue-gray — ALL secondary/inactive
 *
 * Card philosophy: near-transparent surfaces (3-5% cream overlay) with
 * visible 10% cream border frames. Cards breathe with the background
 * rather than sitting as opaque grey blocks.
 *
 * Sage variants: #5F7F5B (pressed), #9AB896 (light)
 * Borders: rgba(245,243,237,0.10) — visible line frames
 */

import { Platform } from 'react-native';

// ─── ThemeColors type ────────────────────────────────────────────────

export type ThemeColors = {
  // Core
  background: string;
  backgroundElevated: string;
  accent: string;             // Tomo Green — primary CTA
  accentDark: string;         // Pressed states
  accentLight: string;        // Highlights, progress bars

  // Text
  textPrimary: string;        // Titles, headings — bright cream
  textBody: string;           // Expanded card body text — readable mid-cream
  textSecondary: string;      // Timestamps, subtitles — muted blue-gray
  textDisabled: string;       // Disabled states
  textOnAccent: string;       // Text on accent-colored buttons
  textLink: string;           // Tappable text links

  // Borders & Surfaces
  border: string;             // Default border (8% cream)
  borderLight: string;        // Subtle separator
  surface: string;            // Card background
  inputBackground: string;    // Input fields


  // --- Tomo 友 Semantic Opacity Tokens ---
  // Use these instead of hardcoding rgba() values
  accentSubtle: string;       // Sage 8% — subtle accent bg (chips, hints)
  accentMuted: string;        // Sage 12% — muted accent bg (selected states)
  accentSoft: string;         // Sage 15% — soft accent bg (badges, pills)
  accentBorder: string;       // Sage 30% — accent border
  secondarySubtle: string;    // Blue-gray 12% — secondary bg
  secondaryMuted: string;     // Blue-gray 18% — secondary active bg
  creamSubtle: string;        // Cream 6% — ghost bg
  creamMuted: string;         // Cream 8% — border (default)
  creamSoft: string;          // Cream 10% — slightly visible bg
  creamOverlay: string;       // Cream 20% — overlay/highlight

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

  // ─── Coach UI Tokens (Phase 1 — "Coach in Your Pocket") ────────
  /** Warm chalk-toned text palette for coach personality */
  chalk: string;
  chalkDim: string;
  chalkFaint: string;
  chalkGhost: string;
  /** Warm surface variants */
  surfaceWarm: string;
  cardWarm: string;
  borderWarm: string;
  /** Coach note component */
  coachNoteBackground: string;
  coachNoteBorder: string;
  coachSignature: string;
  /** Sketch corner marks */
  sketchMark: string;
  /** v0 Electric Green — bright active/readiness color */
  electricGreen: string;
  electricGreenMuted: string;
  electricGreenDim: string;
  /** Tomo brand orange (primary brand CTA, distinct from green accent) */
  tomoOrange: string;
  tomoOrangeDim: string;
  tomoOrangeGlow: string;
  /** Tomo brand teal (secondary brand) */
  tomoTeal: string;
  tomoTealDim: string;
  /** Pillar accent colors */
  pillarEndurance: string;
  pillarEnduranceBg: string;
  pillarStrength: string;
  pillarStrengthBg: string;
  pillarPower: string;
  pillarPowerBg: string;
  pillarSpeed: string;
  pillarSpeedBg: string;
  pillarAgility: string;
  pillarAgilityBg: string;
  pillarFlexibility: string;
  pillarFlexibilityBg: string;
  pillarMental: string;
  pillarMentalBg: string;
  /** Brand gradient (orange → teal, for CTAs) */
  gradientBrand: [string, string];

  // ─── Bond tokens (design handoff v1.1) ─────────────────────────
  /**
   * Canonical Bond palette. These mirror `tomo_handoff/tokens/colors.css`
   * 1:1 so Bond-native components can reference the exact handoff names.
   * Existing tokens (background, accent, accentLight, etc.) already equal
   * ink / sage / sage-dim — these aliases add the missing clay, steel,
   * and ink-hover values without changing existing consumers.
   */
  tomoInk: string;
  tomoInkHover: string;
  tomoCream: string;
  tomoSage: string;
  tomoSageDim: string;
  tomoClay: string;
  tomoSteel: string;

  // ─── Player App design tokens (Phase 5 — from kyrai design bundle data.jsx) ──────
  /** Sage opacity scale — for subtle backgrounds, borders, active states. */
  sage08: string;
  sage12: string;
  sage15: string;
  sage30: string;
  /** Cream opacity scale — for cards, borders, dividers, overlays. */
  cream03: string;
  cream06: string;
  cream08: string;
  cream10: string;
  cream15: string;
  cream20: string;
  cream50: string;
  /** Text body tones from design. */
  body: string;
  muted: string;
  mutedDim: string;
  /** Event type accent colors (Player App). */
  evTraining: string;
  evMatch: string;
  evRecovery: string;
  evStudy: string;
  evExam: string;
  evOther: string;
};

// ─── Dark Colors (Brand Kit — primary context) ──────────────────────

export const darkColors: ThemeColors = {
  // Core (Tomo 友 — Navy + Sage)
  background: '#12141F',
  backgroundElevated: 'rgba(245,243,237,0.05)',
  accent: '#7A9B76',
  accentDark: '#5F7F5B',
  accentLight: '#9AB896',

  // Text (warm off-white hierarchy)
  textPrimary: '#F5F3ED',        // Titles, card headings — bright
  textBody: '#C8C4BA',           // Card body/detail text — readable mid-cream
  textSecondary: '#7A8A9A',      // Timestamps, subtitles — lightened blue-gray (WCAG AA on dark bg)
  textDisabled: 'rgba(245,243,237,0.15)',
  textOnAccent: '#F5F3ED',
  textLink: '#7A9B76',

  // Borders & Surfaces
  border: 'rgba(245,243,237,0.10)',           // Visible line frame
  borderLight: 'rgba(245,243,237,0.06)',
  surface: 'rgba(245,243,237,0.03)',           // Near-transparent card bg
  inputBackground: 'rgba(245,243,237,0.05)',   // Slightly more presence for inputs


  // --- Tomo 友 Semantic Opacity Tokens ---
  accentSubtle: 'rgba(122,155,118,0.08)',
  accentMuted: 'rgba(122,155,118,0.12)',
  accentSoft: 'rgba(122,155,118,0.15)',
  accentBorder: 'rgba(122,155,118,0.30)',
  secondarySubtle: 'rgba(90,107,124,0.12)',
  secondaryMuted: 'rgba(90,107,124,0.18)',
  creamSubtle: 'rgba(245,243,237,0.06)',
  creamMuted: 'rgba(245,243,237,0.10)',
  creamSoft: 'rgba(245,243,237,0.10)',
  creamOverlay: 'rgba(245,243,237,0.20)',

  // Semantic
  success: '#7A9B76',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#7A8A9A',

  // Readiness
  readinessGreen: '#7A9B76',
  readinessYellow: '#5A6B7C',
  readinessRed: '#5A6B7C',
  readinessGreenBg: 'rgba(122, 155, 118, 0.15)',
  readinessYellowBg: 'rgba(90, 107, 124, 0.15)',
  readinessRedBg: 'rgba(90, 107, 124, 0.15)',

  // Intensity
  intensityRest: '#5A6B7C',
  intensityRestBg: 'rgba(90, 107, 124, 0.15)',
  intensityLight: '#7A9B76',
  intensityLightBg: 'rgba(122, 155, 118, 0.15)',
  intensityModerate: '#5A6B7C',
  intensityModerateBg: 'rgba(90, 107, 124, 0.15)',
  intensityHard: '#5A6B7C',
  intensityHardBg: 'rgba(90, 107, 124, 0.15)',

  // Calendar Events
  eventTraining: '#7A9B76',
  eventMatch: '#7A9B76',
  eventRecovery: '#5A6B7C',
  eventStudyBlock: '#5A6B7C',
  eventExam: '#5A6B7C',
  eventOther: '#5A6B7C',

  // Overlay & Shadow
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  shadow: 'rgba(0, 0, 0, 0.25)',
  shadowDark: 'rgba(0, 0, 0, 0.50)',

  // Skeleton
  skeletonBase: 'rgba(245,243,237,0.03)',
  skeletonHighlight: 'rgba(245,243,237,0.08)',

  // Ghost Calendar
  ghostBorder: 'rgba(245, 243, 237, 0.15)',
  ghostBackground: 'rgba(245, 243, 237, 0.03)',
  ghostText: 'rgba(245, 243, 237, 0.5)',

  // ─── Backward Compatibility Aliases ─────────────────────────────
  accent1: '#7A9B76',
  accent2: '#7A9B76',
  accent1Dark: '#5F7F5B',
  accent1Light: '#9AB896',
  accent2Dark: '#5F7F5B',
  accent2Light: '#9AB896',
  textHeader: '#F5F3ED',
  textOnDark: '#F5F3ED',
  textOnLight: '#F5F3ED',
  textInactive: '#7A8A9A',
  textMuted: 'rgba(245,243,237,0.5)',
  cardLight: 'rgba(245,243,237,0.03)',
  cardMuted: 'rgba(245,243,237,0.02)',
  divider: 'rgba(245,243,237,0.08)',
  borderAccent: 'rgba(122, 155, 118, 0.30)',
  glowOrange: 'rgba(122, 155, 118, 0.20)',
  glowCyan: 'rgba(122, 155, 118, 0.15)',
  glass: 'rgba(245,243,237,0.03)',
  glassBorder: 'rgba(245,243,237,0.10)',
  glassHighlight: 'rgba(245,243,237,0.06)',
  surfaceElevated: 'rgba(245,243,237,0.05)',
  chipBackground: 'rgba(245,243,237,0.06)',
  chipText: '#7A9B76',
  navBackground: '#12141F',
  gradientOrangeCyan: ['#7A9B76', '#5F7F5B'],
  gradientOrange: ['#7A9B76', '#9AB896'],
  gradientCyan: ['#5F7F5B', '#7A9B76'],
  gradientDark: ['#12141F', '#1A1D2B'],
  gradientGlass: ['rgba(245,243,237,0.04)', 'rgba(245,243,237,0.01)'],
  pastelTerracotta: 'rgba(245,243,237,0.03)',
  pastelPeach: 'rgba(245,243,237,0.03)',
  logout: '#7A8A9A',
  archetypePhoenix: '#7A9B76',
  archetypeTitan: '#5A6B7C',
  archetypeBlade: '#7A9B76',
  archetypeSurge: '#7A9B76',
  tierBronze: '#7A9B76',
  tierBronzeDark: '#5A6B7C',
  tierSilver: '#7A9B76',
  tierSilverDark: '#5A6B7C',
  tierGold: '#7A9B76',
  tierGoldDark: '#5A6B7C',
  tierDiamond: '#7A9B76',
  tierDiamondDark: '#5A6B7C',
  tierDiamondBorder: '#7A9B76',
  dnaPower: '#7A9B76',
  dnaReflexes: '#5A6B7C',
  dnaControl: '#7A9B76',
  dnaStamina: '#7A9B76',
  dnaAgility: '#5A6B7C',
  dnaTactics: '#5A6B7C',
  shotExcellent: '#7A9B76',
  shotGood: '#7A9B76',
  shotAverage: '#5A6B7C',
  shotDeveloping: '#5A6B7C',
  streakBadgeBg: 'rgba(122, 155, 118, 0.15)',

  // ─── Coach UI Tokens ────────────────────────────────────────────
  chalk: '#F5F3ED',
  chalkDim: 'rgba(245,243,237,0.5)',
  chalkFaint: 'rgba(245,243,237,0.15)',
  chalkGhost: 'rgba(245,243,237,0.06)',
  surfaceWarm: 'rgba(245,243,237,0.03)',
  cardWarm: 'rgba(245,243,237,0.03)',
  borderWarm: 'rgba(245,243,237,0.10)',
  /** Sage green — Tomo 友 primary accent */
  electricGreen: '#7A9B76',
  electricGreenMuted: '#5F7F5B',
  electricGreenDim: 'rgba(122,155,118,0.12)',
  coachNoteBackground: 'rgba(245,243,237,0.04)',
  coachNoteBorder: 'rgba(122,155,118,0.25)',
  coachSignature: '#7A9B76',
  sketchMark: 'rgba(245,243,237,0.10)',
  tomoOrange: '#7A9B76',
  tomoOrangeDim: 'rgba(122,155,118,0.15)',
  tomoOrangeGlow: 'rgba(122,155,118,0.08)',
  tomoTeal: '#7A9B76',
  tomoTealDim: 'rgba(122,155,118,0.12)',
  pillarEndurance: '#7A9B76',
  pillarEnduranceBg: 'rgba(122,155,118,0.10)',
  pillarStrength: '#7A9B76',
  pillarStrengthBg: 'rgba(122,155,118,0.10)',
  pillarPower: '#7A9B76',
  pillarPowerBg: 'rgba(122,155,118,0.10)',
  pillarSpeed: '#7A9B76',
  pillarSpeedBg: 'rgba(122,155,118,0.10)',
  pillarAgility: '#7A9B76',
  pillarAgilityBg: 'rgba(122,155,118,0.10)',
  pillarFlexibility: '#7A9B76',
  pillarFlexibilityBg: 'rgba(122,155,118,0.10)',
  pillarMental: '#F5F3ED',
  pillarMentalBg: 'rgba(245,243,237,0.06)',
  gradientBrand: ['#7A9B76', '#5F7F5B'],

  // ─── Bond tokens (design handoff v1.1) ─────────────────────────
  tomoInk:      '#12141F',
  tomoInkHover: '#1E202D',
  tomoCream:    '#F5F3ED',
  tomoSage:     '#7A9B76',
  tomoSageDim:  '#9AB896',
  tomoClay:     '#C8A27A',
  tomoSteel:    '#8A9BB0',

  // ─── Player App design tokens (Phase 5) ──────────────────────────
  sage08:   'rgba(122,155,118,0.08)',
  sage12:   'rgba(122,155,118,0.12)',
  sage15:   'rgba(122,155,118,0.15)',
  sage30:   'rgba(122,155,118,0.30)',
  cream03:  'rgba(245,243,237,0.03)',
  cream06:  'rgba(245,243,237,0.06)',
  cream08:  'rgba(245,243,237,0.08)',
  cream10:  'rgba(245,243,237,0.10)',
  cream15:  'rgba(245,243,237,0.15)',
  cream20:  'rgba(245,243,237,0.20)',
  cream50:  'rgba(245,243,237,0.50)',
  body:     '#C8C4BA',
  muted:    '#7A8A9A',
  mutedDim: 'rgba(122,138,154,0.6)',
  evTraining: '#7A9B76',
  evMatch:    '#C8A27A',
  evRecovery: '#7AA59B',
  evStudy:    '#8A9BB0',
  evExam:     '#B08A7A',
  evOther:    '#7A8A9A',
};

// ─── Light Colors (Brand Kit) ────────────────────────────────────────

export const lightColors: ThemeColors = {
  // Light mode mirrors dark — dark-only app
  ...darkColors,
};

// ─── Default export (dark) ──────────────────────────────────────────
export const colors = darkColors;

// ─── Screen-root background ─────────────────────────────────────────
// Platform-aware. On web, screen roots are transparent so the body's
// starfield/dust gradient (injected via utils/webBackground.ts) shows
// through. On native, solid ink (#12141F) — same as before.
// Use this for full-screen root containers only. Cards, modals, inputs,
// and other dense surfaces keep their own opaque tokens.
export const screenBg: string = Platform.OS === 'web' ? 'transparent' : '#12141F';

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

// ─── Pillar Colors (Coach in Your Pocket) ──────────────────────────
export const pillarColors: Record<string, { accent: string; bg: string }> = {
  endurance: { accent: colors.pillarEndurance, bg: colors.pillarEnduranceBg },
  strength: { accent: colors.pillarStrength, bg: colors.pillarStrengthBg },
  power: { accent: colors.pillarPower, bg: colors.pillarPowerBg },
  speed: { accent: colors.pillarSpeed, bg: colors.pillarSpeedBg },
  agility: { accent: colors.pillarAgility, bg: colors.pillarAgilityBg },
  flexibility: { accent: colors.pillarFlexibility, bg: colors.pillarFlexibilityBg },
  mental: { accent: colors.pillarMental, bg: colors.pillarMentalBg },
};
