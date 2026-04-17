/**
 * DashboardSectionRenderer — Maps CMS component_type to React Native components.
 *
 * Consumes the `dashboardLayout` array from boot data and renders each section
 * in order. Unknown component types render nothing (graceful skip).
 *
 * Each section component receives:
 *   - config: Record<string, unknown> — per-component CMS config
 *   - coachingText: string | null — interpolated coaching text
 *   - bootData: BootData — full boot payload for data access
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

export interface SectionProps {
  config: Record<string, unknown>;
  coachingText: string | null;
  bootData: BootData;
}

/**
 * Component registry — maps component_type to React component.
 *
 * Three types are intentionally excluded — they're rendered separately
 * by SignalDashboardScreen with special layout treatment:
 *   signal_hero  — hero slot at top of screen
 *   daily_recs   — between hero and CMS sections
 *   up_next      — timeline section after CMS sections
 *
 * Their CMS rows control visibility (toggle on/off), but rendering
 * is handled by the screen, not by this renderer.
 */
const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps>> = {
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
        // Skip screen-level types — rendered by SignalDashboardScreen directly
        if (section.component_type === 'signal_hero') return null;
        if (section.component_type === 'daily_recs') return null;
        if (section.component_type === 'up_next') return null;

        const Component = SECTION_COMPONENTS[section.component_type];
        if (!Component) return null; // Unknown type — graceful skip

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
  },
  sectionWrap: {
    // Each section manages its own internal padding
  },
});
