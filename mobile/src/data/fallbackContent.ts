/**
 * Fallback Content — Bundled fallback data for offline/first-install scenarios.
 *
 * Used ONLY when: no AsyncStorage cache AND no network (first install offline).
 * Same shape as the API bundle response.
 *
 * This file re-exports the current hardcoded data structured as a ContentBundle.
 * It exists as the last-resort safety net so the app never renders empty.
 */

import type { ContentBundle } from '../services/contentService';

// Import existing hardcoded data
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
import {
  DNA_ATTRIBUTE_ORDER,
  DNA_ATTRIBUTE_LABELS,
  DNA_ATTRIBUTE_FULL_NAMES,
  SHOT_ORDER,
} from '../types/padel';
import {
  PADEL_RATING_LEVELS,
  DNA_ATTRIBUTE_COLORS,
  DNA_OVERALL_WEIGHTS,
} from '../services/padelCalculations';
import { FOOTBALL_ATTRIBUTE_COLORS } from '../services/footballCalculations';

/**
 * Build a minimal fallback ContentBundle from hardcoded TypeScript data.
 * Only covers the fields needed for SportConfig building.
 */
export function buildFallbackBundle(): ContentBundle {
  // Sports
  const sports = [
    { id: 'football', label: 'Football', icon: 'football-outline', color: '#FF6B35', sort_order: 1, available: true, config: {} },
    { id: 'padel', label: 'Padel', icon: 'tennisball-outline', color: '#00D9FF', sort_order: 2, available: true, config: { dnaOverallWeights: DNA_OVERALL_WEIGHTS } },
  ];

  // Football attributes
  const footballAttrs = FOOTBALL_ATTRIBUTE_ORDER.map((key, i) => {
    const cfg = FOOTBALL_ATTRIBUTE_CONFIG[key];
    return {
      sport_id: 'football',
      key,
      label: cfg.label,
      full_name: FOOTBALL_ATTRIBUTE_FULL_NAMES[key],
      abbreviation: cfg.abbreviation,
      description: cfg.description,
      color: cfg.color,
      max_value: cfg.maxValue,
      sort_order: i + 1,
      sub_attributes: cfg.subAttributes,
    };
  });

  // Padel attributes
  const padelAttrs = DNA_ATTRIBUTE_ORDER.map((key, i) => ({
    sport_id: 'padel',
    key,
    label: DNA_ATTRIBUTE_LABELS[key],
    full_name: DNA_ATTRIBUTE_FULL_NAMES[key],
    abbreviation: DNA_ATTRIBUTE_LABELS[key],
    description: '',
    color: DNA_ATTRIBUTE_COLORS[key],
    max_value: 99,
    sort_order: i + 1,
    sub_attributes: [],
  }));

  // Football skills
  const footballSkills = FOOTBALL_SKILL_ORDER.map((key, i) => {
    const cfg = FOOTBALL_SKILL_CONFIG[key];
    return {
      sport_id: 'football',
      key,
      name: cfg.name,
      category: cfg.category,
      description: cfg.description,
      icon: cfg.icon,
      sort_order: i + 1,
      sub_metrics: cfg.subMetrics,
    };
  });

  // Football positions
  const footballPositions = (Object.keys(FOOTBALL_POSITION_WEIGHTS) as Array<keyof typeof FOOTBALL_POSITION_WEIGHTS>).map((key, i) => ({
    sport_id: 'football',
    key,
    label: FOOTBALL_POSITION_LABELS[key],
    sort_order: i + 1,
    attribute_weights: FOOTBALL_POSITION_WEIGHTS[key],
  }));

  // Football rating levels
  const footballRatingLevels = FOOTBALL_RATING_LEVELS.map((l, i) => ({
    sport_id: 'football',
    name: l.name,
    min_rating: l.minRating,
    max_rating: l.maxRating,
    description: l.description,
    color: l.color,
    sort_order: i + 1,
  }));

  // Padel rating levels
  const padelRatingLevels = PADEL_RATING_LEVELS.map((l, i) => ({
    sport_id: 'padel',
    name: l.name,
    min_rating: l.range[0],
    max_rating: l.range[1],
    description: l.description,
    color: '',
    sort_order: i + 1,
  }));

  return {
    sports,
    sport_attributes: [...footballAttrs, ...padelAttrs],
    sport_skills: footballSkills,
    sport_positions: footballPositions,
    sport_rating_levels: [...footballRatingLevels, ...padelRatingLevels],
    sport_test_definitions: [],
    sport_normative_data: [],
    content_items: [],
    fetched_at: 'fallback',
  };
}
