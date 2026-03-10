/**
 * PadelRatingPathway — Backward-compatible wrapper around RatingPathway.
 *
 * Converts padel-specific rating data + PADEL_RATING_LEVELS into the
 * generic PathwayLevel format. Existing padel screens continue to work
 * without changes to their call sites.
 */

import React from 'react';
import { RatingPathway, type PathwayLevel, type PathwayMilestone } from './RatingPathway';
import { PADEL_RATING_LEVELS } from '../services/padelCalculations';
import type { ProPlayerMilestone } from '../types/padel';

interface PadelRatingPathwayProps {
  rating: number;
  level: string;
  milestones?: ProPlayerMilestone[];
  compact?: boolean;
  index?: number;
  trigger?: boolean;
}

/** Map PADEL_RATING_LEVELS → generic PathwayLevel[] */
const PADEL_PATHWAY_LEVELS: PathwayLevel[] = PADEL_RATING_LEVELS.map((lvl) => ({
  name: lvl.name,
  minRating: lvl.range[0],
  maxRating: lvl.range[1],
  description: lvl.description,
}));

export function PadelRatingPathway({
  rating,
  level,
  milestones = [],
  compact = false,
  index = 0,
  trigger,
}: PadelRatingPathwayProps) {
  // Find the current level from the mapped pathway levels
  const currentLevel = PADEL_PATHWAY_LEVELS.find(
    (l) => rating >= l.minRating && rating <= l.maxRating,
  ) ?? PADEL_PATHWAY_LEVELS[0];

  // Map ProPlayerMilestone → generic PathwayMilestone
  const pathwayMilestones: PathwayMilestone[] = milestones.map((m) => ({
    rating: m.rating,
    name: m.name,
    reason: m.reason,
  }));

  return (
    <RatingPathway
      currentRating={rating}
      currentLevel={currentLevel}
      allLevels={PADEL_PATHWAY_LEVELS}
      sport="padel"
      milestones={pathwayMilestones}
      compact={compact}
      index={index}
      trigger={trigger}
    />
  );
}
