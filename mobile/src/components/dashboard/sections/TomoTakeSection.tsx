/**
 * CMS `tomo_take` — closing coaching card (“Tomo’s take”).
 * Uses interpolated `coaching_text` when set; otherwise `signalContext.coaching`.
 */

import React, { useMemo } from 'react';
import { TomoTakeCard } from '../signal/TomoTakeCard';
import type { SectionProps } from './DashboardSectionRenderer';

export const TomoTakeSection = React.memo(function TomoTakeSection({
  coachingText,
  bootData,
}: SectionProps) {
  const message = useMemo(
    () => coachingText ?? bootData.signalContext?.coaching ?? '',
    [coachingText, bootData.signalContext?.coaching],
  );
  if (!message) return null;
  return <TomoTakeCard message={message} />;
});
