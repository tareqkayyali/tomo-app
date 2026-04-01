/**
 * ShotRatingBar — Backward-compatible wrapper around SkillRatingBar.
 *
 * Converts padel-specific ShotDefinition + ShotData props into the
 * generic SkillItem format. Existing padel screens continue to work
 * without changes to their call sites.
 */

import React from 'react';
import { SkillRatingBar, type SkillItem, type SkillSubMetric } from './SkillRatingBar';
import type { ShotDefinition, ShotData } from '../types/padel';

interface ShotRatingBarProps {
  definition: ShotDefinition;
  data: ShotData;
  index: number;
  onPress?: () => void;
  trigger?: boolean;
}

export function ShotRatingBar({ definition, data, index, onPress, trigger }: ShotRatingBarProps) {
  // Map padel ShotDefinition + ShotData → generic SkillItem
  const skill: SkillItem = {
    key: definition.type,
    name: definition.name,
    overall: data.rating,
    subMetrics: definition.subMetrics.map((sm) => ({
      name: sm.label,
      value: data.subMetrics[sm.key] ?? 0,
    })),
    icon: definition.icon,
    category: definition.category,
    trend: data.trend,
  };

  return (
    <SkillRatingBar
      skill={skill}
      sport="padel"
      index={index}
      onPress={onPress}
      trigger={trigger}
    />
  );
}
