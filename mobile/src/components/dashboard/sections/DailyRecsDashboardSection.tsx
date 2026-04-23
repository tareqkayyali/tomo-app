/**
 * CMS `daily_recs` — expandable RIE cards (“Today · For you”).
 */

import React from 'react';
import { DailyRecommendations } from '../DailyRecommendations';
import type { SectionProps } from './DashboardSectionRenderer';

export const DailyRecsDashboardSection = React.memo(function DailyRecsDashboardSection({
  config,
  bootData,
}: SectionProps) {
  const maxItems = (config.max_items as number) ?? 5;
  const recs = bootData.dashboardRecs ?? [];
  if (!recs.length) return null;

  const signalColor = bootData.signalContext?.color ?? '#7a9b76';
  const capped = recs.slice(0, Math.max(1, Math.min(maxItems, 20)));

  return <DailyRecommendations recs={capped} signalColor={signalColor} />;
});
