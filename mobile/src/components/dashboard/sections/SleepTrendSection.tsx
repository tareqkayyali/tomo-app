/**
 * CMS `sleep_trend` — 7-night sleep card (Pulse spec).
 * Config: `target_hours` (default 8.5) — matches CMS `dashboard_sections.config`.
 */

import React, { useMemo } from 'react';
import { SleepTrendCard } from '../signal/SleepTrendCard';
import { deriveSleep, SLEEP_TARGET_HOURS } from '../signal/dashboardPulseDerivations';
import type { SectionProps } from './DashboardSectionRenderer';

export const SleepTrendSection = React.memo(function SleepTrendSection({
  config,
  bootData,
}: SectionProps) {
  const target = typeof config.target_hours === 'number' ? config.target_hours : SLEEP_TARGET_HOURS;
  const data = useMemo(() => deriveSleep(bootData), [bootData]);
  if (!data) return null;

  const adjusted =
    target !== data.target
      ? {
          ...data,
          target,
          debt: Math.max(
            0,
            data.nights
              .filter((n): n is number => typeof n === 'number')
              .reduce((acc, h) => acc + Math.max(0, target - h), 0),
          ),
        }
      : data;

  return (
    <SleepTrendCard
      nights={adjusted.nights}
      nightsLabels={adjusted.nightsLabels}
      weekAvg={adjusted.weekAvg}
      target={adjusted.target}
      debt={adjusted.debt}
      trend={adjusted.trend}
    />
  );
});
