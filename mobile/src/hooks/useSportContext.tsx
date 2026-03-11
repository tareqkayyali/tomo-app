/**
 * Tomo Sport Context Provider
 *
 * Central hub for multi-sport switching. Manages which sport is active and
 * provides sport-specific configuration (attributes, skills, rating levels,
 * calculations, mock data, colors, icons) to all downstream screens.
 *
 * Architecture:
 * ┌─────────────┐
 * │ SportProvider│  ← wraps app, reads AsyncStorage on mount
 * │  activeSport │  ← 'football' | 'padel'
 * │  sportConfig │  ← computed from activeSport (types + calcs + data)
 * └──────┬──────┘
 *        │ context
 *   ┌────┴────┐
 *   │ Screens │
 *   │ ────────│
 *   │ Sport-AGNOSTIC: Calendar, Check-in, Readiness │
 *   │   (ignore sportConfig, work the same always)   │
 *   │ Sport-SPECIFIC: Progress, Tests, Skills         │
 *   │   (consume sportConfig for rendering)           │
 *   └─────────┘
 *
 * Research basis:
 * - Multi-sport athletes have more diverse, protective athletic identity
 *   (PMC, 2021). Sport switching should feel natural, not like "starting over."
 * - Cote's Developmental Model: Sampling (6-12), Specializing (13-15),
 *   Investment (16+). Our 13-23 users span specializing and investment —
 *   they may play 1-2 sports seriously.
 * - Early specialization increases burnout (meta-analysis, n=1,429).
 *   Supporting multi-sport participation is protective.
 *
 * SDT — Autonomy:
 * The user chooses which sport to view. We never auto-switch. We never
 * suggest one sport is "primary." Both sports are equal in the UI even
 * if one has more data.
 *
 * Persistence:
 * Active sport is stored in AsyncStorage under '@tomo_active_sport'.
 * On launch the last-selected sport is restored so the user returns
 * exactly where they left off.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_ACTIVE_SPORT } from '../constants/storageKeys';

// ── Football imports ──
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_ATTRIBUTE_LABELS,
  FOOTBALL_ATTRIBUTE_FULL_NAMES,
  FOOTBALL_ATTRIBUTE_CONFIG,
  FOOTBALL_SKILL_ORDER,
  FOOTBALL_SKILL_CONFIG,
  FOOTBALL_POSITION_WEIGHTS,
  FOOTBALL_POSITION_LABELS,
  FOOTBALL_RATING_LEVELS,
} from '../types/football';
import type {
  FootballAttribute,
  FootballSkill,
  FootballPosition,
  FootballAttributeConfig,
  FootballSkillConfig,
  FootballRatingLevel,
} from '../types/football';
import {
  calculateFootballAttribute,
  calculateOverallRating as calcFootballOverall,
  calculatePathwayRating as calcFootballPathway,
  getFootballRatingLevel,
  calculateSkillRating as calcFootballSkill,
  getAttributePercentile,
  getReadinessRecommendation,
  FOOTBALL_ATTRIBUTE_COLORS,
} from '../services/footballCalculations';
import {
  getMockPlayerForUser,
  getMockPlayerSkillsForUser,
  getMockPlayerHistoryForUser,
  getFootballMetricsForUser,
} from '../data/footballMockData';

// ── Padel imports ──
import {
  DNA_ATTRIBUTE_ORDER,
  DNA_ATTRIBUTE_LABELS,
  DNA_ATTRIBUTE_FULL_NAMES,
  SHOT_ORDER,
} from '../types/padel';
import type {
  DNAAttribute,
  ShotType,
  PadelRatingLevel,
} from '../types/padel';
import {
  calculateOverallRating as calcPadelOverall,
  getDNATier,
  getTierLabel,
  calculateShotRating as calcPadelShot,
  calculatePadelRating,
  getPadelLevel,
  PADEL_RATING_LEVELS,
  DNA_ATTRIBUTE_COLORS,
  DNA_OVERALL_WEIGHTS,
} from '../services/padelCalculations';
import {
  SHOT_DEFINITIONS,
  getDNACardForUser,
  getShotRatingsForUser,
  DEMO_PHYSICAL_METRICS,
} from '../services/padelMockData';

// ═══ TYPES ═══

/** The two sports currently supported with full data pipelines. */
export type ActiveSport = 'football' | 'padel';

/**
 * Unified attribute descriptor.
 * Normalizes football's FootballAttributeConfig and padel's simpler label maps
 * into a single shape that UI components can consume without sport awareness.
 */
export interface AttributeDescriptor {
  key: string;
  label: string;       // 3-char abbreviation (PAC, POW, etc.)
  fullName: string;    // "Pace", "Power", etc.
  color: string;       // hex accent color
}

/**
 * Unified skill/shot descriptor.
 * Covers both football's 8 skills and padel's 8 shots.
 */
export interface SkillDescriptor {
  key: string;
  name: string;
  category: string;
  icon: string;
  subMetricCount: number;
}

/**
 * Unified rating level descriptor.
 * Both sports use a 0-1000 pathway rating mapped to named tiers.
 */
export interface RatingLevelDescriptor {
  name: string;
  minRating: number;
  maxRating: number;
  description: string;
  color?: string;
}

/**
 * Sport-specific calculation functions.
 * Each sport wires its own implementation; consumers call these
 * without knowing which sport is active.
 */
export interface SportCalculations {
  calculateOverallRating: (...args: unknown[]) => number;
  getRatingLevel: (rating: number) => { name: string; description: string };
  getAttributeColors: () => Record<string, string>;
}

/**
 * Sport-specific mock data accessors.
 * Provides user-aware demo/fallback data for each sport.
 * Returns null/empty when no data exists for the given userId (→ empty state).
 */
export interface SportMockData {
  /** Get card/profile data for a user */
  getCard: (userId: string) => any | null;
  /** Get skills/shots data for a user */
  getSkills: (userId: string) => any | null;
  /** Get history entries for a user */
  getHistory: (userId: string) => any[] | null;
  /** Get physical metrics for a user */
  getMetrics: (userId: string) => any[];
}

/**
 * The full sport configuration object.
 * Computed from activeSport — every sport-specific screen reads this.
 */
export interface SportConfig {
  /** Which sport this config represents */
  sport: ActiveSport;
  /** Human-readable sport name */
  label: string;
  /** Ionicon name for the sport */
  icon: string;
  /** Primary accent color for the sport */
  color: string;

  /** Ordered attribute list (6 for both sports) */
  attributes: AttributeDescriptor[];
  /** Ordered skill/shot list (8 for both sports) */
  skills: SkillDescriptor[];
  /** Rating pathway levels (10 for both sports) */
  ratingLevels: RatingLevelDescriptor[];

  /** Sport-specific calculation functions */
  calculations: SportCalculations;
  /** Sport-specific mock/demo data */
  mockData: SportMockData;
}

/**
 * The shape of the context value provided to all consumers.
 */
export interface SportContextType {
  /** Currently active sport */
  activeSport: ActiveSport;
  /** Switch the active sport (persists to AsyncStorage) */
  setActiveSport: (sport: ActiveSport) => void;
  /** Fully computed config for the active sport */
  sportConfig: SportConfig;
  /** Sports the user has set up (from profile data) */
  userSports: ActiveSport[];
  /** Convenience: true when user has configured 2+ sports */
  hasMultipleSports: boolean;
  /** Opacity Animated.Value for cross-fade on sport switch (0→1) */
  fadeAnim: Animated.Value;
  /** True while restoring persisted sport from AsyncStorage */
  isLoading: boolean;
}

// ═══ CONSTANTS ═══

const STORAGE_KEY = STORAGE_KEY_ACTIVE_SPORT;
const FADE_DURATION = 150; // ms — subtle cross-fade per spec
const DEFAULT_SPORT: ActiveSport = 'football';

// ═══ SPORT CONFIG BUILDERS ═══

/**
 * Build the football SportConfig.
 * Maps football types, calculations, and mock data into the unified shape.
 */
function buildFootballConfig(): SportConfig {
  const attributes: AttributeDescriptor[] = FOOTBALL_ATTRIBUTE_ORDER.map(key => ({
    key,
    label: FOOTBALL_ATTRIBUTE_LABELS[key],
    fullName: FOOTBALL_ATTRIBUTE_FULL_NAMES[key],
    color: FOOTBALL_ATTRIBUTE_COLORS[key],
  }));

  const skills: SkillDescriptor[] = FOOTBALL_SKILL_ORDER.map(key => {
    const cfg = FOOTBALL_SKILL_CONFIG[key];
    return {
      key,
      name: cfg.name,
      category: cfg.category,
      icon: cfg.icon,
      subMetricCount: cfg.subMetrics.length,
    };
  });

  const ratingLevels: RatingLevelDescriptor[] = FOOTBALL_RATING_LEVELS.map(l => ({
    name: l.name,
    minRating: l.minRating,
    maxRating: l.maxRating,
    description: l.description,
    color: l.color,
  }));

  return {
    sport: 'football',
    label: 'Football',
    icon: 'football-outline',
    color: '#2ECC71',
    attributes,
    skills,
    ratingLevels,
    calculations: {
      calculateOverallRating: (...args: unknown[]) =>
        calcFootballOverall(args[0] as Record<FootballAttribute, number>, args[1] as FootballPosition),
      getRatingLevel: (rating: number) => {
        const level = getFootballRatingLevel(rating);
        return { name: level.name, description: level.description };
      },
      getAttributeColors: () => ({ ...FOOTBALL_ATTRIBUTE_COLORS }),
    },
    mockData: {
      getCard: (userId: string) => getMockPlayerForUser(userId) ?? null,
      getSkills: (userId: string) => getMockPlayerSkillsForUser(userId) ?? null,
      getHistory: (userId: string) => getMockPlayerHistoryForUser(userId) ?? null,
      getMetrics: (userId: string) => getFootballMetricsForUser(userId),
    },
  };
}

/**
 * Build the padel SportConfig.
 * Maps padel types, calculations, and mock data into the unified shape.
 */
function buildPadelConfig(): SportConfig {
  const attributes: AttributeDescriptor[] = DNA_ATTRIBUTE_ORDER.map(key => ({
    key,
    label: DNA_ATTRIBUTE_LABELS[key],
    fullName: DNA_ATTRIBUTE_FULL_NAMES[key],
    color: DNA_ATTRIBUTE_COLORS[key],
  }));

  const skills: SkillDescriptor[] = SHOT_ORDER.map(key => {
    const def = SHOT_DEFINITIONS[key];
    return {
      key,
      name: def.name,
      category: def.category,
      icon: def.icon,
      subMetricCount: def.subMetrics.length,
    };
  });

  const ratingLevels: RatingLevelDescriptor[] = PADEL_RATING_LEVELS.map(l => ({
    name: l.name,
    minRating: l.range[0],
    maxRating: l.range[1],
    description: l.description,
  }));

  return {
    sport: 'padel',
    label: 'Padel',
    icon: 'tennisball-outline',
    color: '#2ECC71',
    attributes,
    skills,
    ratingLevels,
    calculations: {
      calculateOverallRating: (...args: unknown[]) =>
        calcPadelOverall(args[0] as Record<DNAAttribute, number>),
      getRatingLevel: (rating: number) => {
        const name = getPadelLevel(rating);
        const level = PADEL_RATING_LEVELS.find(
          l => rating >= l.range[0] && rating <= l.range[1],
        );
        return { name, description: level?.description ?? '' };
      },
      getAttributeColors: () => ({ ...DNA_ATTRIBUTE_COLORS }),
    },
    mockData: {
      getCard: (userId: string) => getDNACardForUser(userId) ?? null,
      getSkills: (userId: string) => getShotRatingsForUser(userId) ?? null,
      getHistory: (userId: string) => {
        const card = getDNACardForUser(userId);
        return card?.history ?? null;
      },
      getMetrics: (userId: string) => {
        const card = getDNACardForUser(userId);
        return card ? [...DEMO_PHYSICAL_METRICS] : [];
      },
    },
  };
}

// Pre-build configs so useMemo only swaps references (no re-computation per render)
const FOOTBALL_CONFIG = buildFootballConfig();
const PADEL_CONFIG = buildPadelConfig();

// ═══ CONTEXT ═══

const SportContext = createContext<SportContextType | undefined>(undefined);

// ═══ PROVIDER ═══

/**
 * SportProvider — wrap this around the app (inside ThemeProvider, alongside AuthProvider).
 *
 * On mount:
 * 1. Reads last active sport from AsyncStorage
 * 2. Falls back to DEFAULT_SPORT if none stored
 * 3. Builds sportConfig from the active sport
 *
 * On sport switch:
 * 1. Fades content out (opacity → 0) over FADE_DURATION ms
 * 2. Swaps activeSport state
 * 3. Persists to AsyncStorage
 * 4. Fades content back in (opacity → 1) over FADE_DURATION ms
 *
 * @param children - App tree
 * @param userSports - Sports the user has configured (from auth/profile).
 *   Defaults to ['football'] if not provided.
 */
export function SportProvider({
  children,
  userSports = [DEFAULT_SPORT],
}: {
  children: ReactNode;
  userSports?: ActiveSport[];
}) {
  const [activeSport, setActiveSportState] = useState<ActiveSport>(DEFAULT_SPORT);
  const [isLoading, setIsLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Restore persisted sport on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'football' || stored === 'padel') {
        setActiveSportState(stored);
      }
      setIsLoading(false);
    });
  }, []);

  /**
   * Switch active sport with cross-fade animation.
   * Persists choice to AsyncStorage so the user returns to the same sport
   * on next app launch.
   *
   * SDT — Autonomy: This is ONLY called by explicit user action.
   * We never auto-switch or suggest switching.
   */
  const setActiveSport = useCallback((sport: ActiveSport) => {
    if (sport === activeSport) return;

    // Fade out → swap → fade in (150ms each direction)
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start(() => {
      setActiveSportState(sport);
      AsyncStorage.setItem(STORAGE_KEY, sport);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start();
    });
  }, [activeSport, fadeAnim]);

  const value = useMemo<SportContextType>(() => ({
    activeSport,
    setActiveSport,
    sportConfig: activeSport === 'football' ? FOOTBALL_CONFIG : PADEL_CONFIG,
    userSports,
    hasMultipleSports: userSports.length > 1,
    fadeAnim,
    isLoading,
  }), [activeSport, setActiveSport, userSports, fadeAnim, isLoading]);

  return (
    <SportContext.Provider value={value}>
      {children}
    </SportContext.Provider>
  );
}

// ═══ HOOK ═══

/**
 * Access the sport context from any component.
 *
 * Sport-SPECIFIC screens (Progress, Tests, Skills) use this to get:
 * - sportConfig.attributes — what to render on the radar/hexagon
 * - sportConfig.skills — what to show in skill mastery lists
 * - sportConfig.calculations — how to compute ratings
 * - sportConfig.mockData — fallback demo data
 *
 * Sport-AGNOSTIC screens (Calendar, Check-in, Readiness) typically
 * don't need this hook at all — they work identically for any sport.
 *
 * @throws Error if used outside SportProvider
 */
export function useSportContext(): SportContextType {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error('useSportContext must be used within SportProvider');
  return ctx;
}

// ═══ RAW CONFIG ACCESS (for non-React contexts like tests) ═══

/**
 * Get the SportConfig for a specific sport without needing React context.
 * Useful in test files and utility functions that run outside the component tree.
 */
export function getSportConfig(sport: ActiveSport): SportConfig {
  return sport === 'football' ? FOOTBALL_CONFIG : PADEL_CONFIG;
}
