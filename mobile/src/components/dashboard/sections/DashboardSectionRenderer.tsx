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
 * signal_hero is intentionally excluded — it's rendered separately
 * in SignalDashboardScreen as the hero section (special layout treatment).
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
  if (!layout || layout.length === 0) return null;

  return (
    <View style={styles.container}>
      {layout.map((section) => {
        // Skip signal_hero — rendered separately in the hero slot
        if (section.component_type === 'signal_hero') return null;

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
