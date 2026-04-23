/**
 * DashboardSectionRenderer — Maps CMS `dashboard_sections.component_type` to RN.
 *
 * Consumes `bootData.dashboardLayout` (screen-level rows only, `panel_key IS NULL`)
 * in `sort_order`. Includes Pulse blocks (`signal_hero`, `daily_recs`, `up_next`,
 * `sleep_trend`, `weekly_pulse`, `benchmark_panel`, `tomo_take`) plus analytics
 * cards. Unknown types are skipped.
 *
 * Each section receives: `config`, `coachingText`, `bootData`.
 */

import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { BootData } from '../../../services/api';
import { spacing } from '../../../theme';

// Section components
import { StatusRingSection } from './StatusRingSection';
import { KpiRowSection } from './KpiRowSection';
import { SparklineRowSection } from './SparklineRowSection';
import { DualLoadSection } from './DualLoadSection';
import { BenchmarkSection } from './BenchmarkSection';
import { RecListSection } from './RecListSection';
import { EventListSection } from './EventListSection';
import { GrowthCardSection } from './GrowthCardSection';
import { EngagementBarSection } from './EngagementBarSection';
import { ProtocolBannerSection } from './ProtocolBannerSection';
import { CustomCardSection } from './CustomCardSection';
import { SignalHeroSection } from './SignalHeroSection';
import { DailyRecsDashboardSection } from './DailyRecsDashboardSection';
import { UpNextTimelineSection } from './UpNextTimelineSection';
import { SleepTrendSection } from './SleepTrendSection';
import { WeeklyPulseSection } from './WeeklyPulseSection';
import { BenchmarkPanelSection } from './BenchmarkPanelSection';
import { TomoTakeSection } from './TomoTakeSection';

export interface SectionProps {
  config: Record<string, unknown>;
  coachingText: string | null;
  bootData: BootData;
}

/** Maps `dashboard_sections.component_type` (CMS) → RN section. */
const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps>> = {
  signal_hero: SignalHeroSection,
  daily_recs: DailyRecsDashboardSection,
  up_next: UpNextTimelineSection,
  sleep_trend: SleepTrendSection,
  weekly_pulse: WeeklyPulseSection,
  benchmark_panel: BenchmarkPanelSection,
  tomo_take: TomoTakeSection,
  status_ring: StatusRingSection,
  kpi_row: KpiRowSection,
  sparkline_row: SparklineRowSection,
  dual_load: DualLoadSection,
  benchmark: BenchmarkSection,
  rec_list: RecListSection,
  event_list: EventListSection,
  growth_card: GrowthCardSection,
  engagement_bar: EngagementBarSection,
  protocol_banner: ProtocolBannerSection,
  custom_card: CustomCardSection,
};

interface DashboardSectionRendererProps {
  layout: BootData['dashboardLayout'];
  bootData: BootData;
}

export const DashboardSectionRenderer = memo(function DashboardSectionRenderer({
  layout,
  bootData,
}: DashboardSectionRendererProps) {
  if (!layout || !Array.isArray(layout) || layout.length === 0) return null;

  return (
    <View style={styles.container}>
      {layout.map((section) => {
        const Component = SECTION_COMPONENTS[section.component_type];
        if (!Component) return null;

        return (
          <View key={section.section_key} style={styles.sectionWrap}>
            <Component
              config={section.config}
              coachingText={section.coaching_text}
              bootData={bootData}
            />
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sectionWrap: {
    // Each section manages its own internal padding
  },
});
