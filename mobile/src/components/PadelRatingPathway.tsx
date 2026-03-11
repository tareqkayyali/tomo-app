/**
 * PadelRatingPathway — Backward-compatible wrapper around RatingPathway.
 *
 * Converts padel-specific rating data + PADEL_RATING_LEVELS into the
 * generic PathwayLevel format. Existing padel screens continue to work
 * without changes to their call sites.
 */

import React from 'react';
import { RatingPathway, type PathwayLevel, type PathwayMilestone } from './RatingPathway';
import { useSportContext } from '../hooks/useSportContext';
import type { ProPlayerMilestone } from '../types/padel';

interface PadelRatingPathwayProps {
  rating: number;
  level: string;
  milestones?: ProPlayerMilestone[];
  compact?: boolean;
  index?: number;
  trigger?: boolean;
}

export function PadelRatingPathway({
  rating,
  level,
  milestones = [],
  compact = false,
  index = 0,
  trigger,
}: PadelRatingPathwayProps) {
  const { sportConfig } = useSportContext();

  // Use rating levels from sportConfig (content-driven)
  const pathwayLevels: PathwayLevel[] = sportConfig.ratingLevels.map((l) => ({
    name: l.name,
    minRating: l.minRating,
    maxRating: l.maxRating,
    description: l.description,
    color: l.color,
  }));

  // Find the current level
  const currentLevel = pathwayLevels.find(
    (l) => rating >= l.minRating && rating <= l.maxRating,
  ) ?? pathwayLevels[0];

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
      allLevels={pathwayLevels}
      sport="padel"
      milestones={pathwayMilestones}
      compact={compact}
      index={index}
      trigger={trigger}
    />
  );
}
