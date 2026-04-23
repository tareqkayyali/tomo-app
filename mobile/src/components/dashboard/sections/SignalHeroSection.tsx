/**
 * CMS `signal_hero` — readiness ring + coaching (Pulse dashboard hero).
 * Config (optional): forwarded to future tweaks; labels come from boot snapshot + planning.
 */

import React, { useMemo } from 'react';
import { FocusHero } from '../signal/FocusHero';
import { deriveReadiness, pickHighlightWord } from '../signal/dashboardPulseDerivations';
import type { SectionProps } from './DashboardSectionRenderer';

export const SignalHeroSection = React.memo(function SignalHeroSection({
  config: _config,
  bootData,
  coachingText,
}: SectionProps) {
  const readiness = useMemo(() => deriveReadiness(bootData), [bootData]);
  const modeLabel =
    bootData.planningContext?.athlete_mode ??
    (bootData.snapshot as { athlete_mode?: string } | null)?.athlete_mode ??
    'balanced';
  const coaching = coachingText ?? bootData.signalContext?.coaching ?? '';
  const highlightWord = useMemo(() => pickHighlightWord(coaching), [coaching]);

  return (
    <FocusHero
      readiness={readiness}
      modeLabel={String(modeLabel)}
      coachingMessage={coaching}
      highlightWord={highlightWord}
    />
  );
});
