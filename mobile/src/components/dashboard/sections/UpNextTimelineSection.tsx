/**
 * CMS `up_next` — “What’s coming” milestone timeline (training / match / exam).
 */

import React, { useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { WhatsComingTimeline, type Milestone } from '../signal/WhatsComingTimeline';
import { deriveMilestones } from '../signal/dashboardPulseDerivations';
import type { SectionProps } from './DashboardSectionRenderer';

export const UpNextTimelineSection = React.memo(function UpNextTimelineSection({
  bootData,
}: SectionProps) {
  const navigation = useNavigation<any>();
  const milestones = useMemo(() => deriveMilestones(bootData), [bootData]);

  const onMilestonePress = useCallback(
    (m: Milestone) => {
      try {
        const dateStr = m.startAt.slice(0, 10);
        navigation.navigate('Main', { screen: 'Plan', params: { date: dateStr } });
      } catch {
        /* no-op */
      }
    },
    [navigation],
  );

  if (!milestones.length) return null;

  return <WhatsComingTimeline milestones={milestones} onMilestonePress={onMilestonePress} />;
});
