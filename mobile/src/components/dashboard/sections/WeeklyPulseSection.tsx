/**
 * CMS `weekly_pulse` — HRV · Load · Wellness strip (Pulse spec).
 */

import React, { useMemo } from 'react';
import { WeeklyPulseStrip } from '../signal/WeeklyPulseStrip';
import { derivePulse } from '../signal/dashboardPulseDerivations';
import type { SectionProps } from './DashboardSectionRenderer';

export const WeeklyPulseSection = React.memo(function WeeklyPulseSection({ bootData }: SectionProps) {
  const cells = useMemo(() => derivePulse(bootData), [bootData]);
  if (!cells.length) return null;
  return <WeeklyPulseStrip cells={cells} />;
});
