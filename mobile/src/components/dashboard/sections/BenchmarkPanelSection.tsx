/**
 * CMS `benchmark_panel` — strength + gap cards from `benchmarkSummary` (Pulse Growth block).
 */

import React from 'react';
import { BenchmarkGrid } from '../signal/BenchmarkGrid';
import type { SectionProps } from './DashboardSectionRenderer';

export const BenchmarkPanelSection = React.memo(function BenchmarkPanelSection({ bootData }: SectionProps) {
  const strength = bootData.benchmarkSummary?.topStrengthDetail ?? null;
  const gap = bootData.benchmarkSummary?.topGapDetail ?? null;
  if (!strength && !gap) return null;
  return <BenchmarkGrid strength={strength} gap={gap} />;
});
