/**
 * SignalHero — The hero section of the Dashboard.
 *
 * Renders: QuickAccessRow, SignalArcIcon + name, SignalPillRow, CoachingCallout.
 * Background color shifts based on the active signal.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';
import { SignalArcIcon } from './SignalArcIcon';
import { QuickAccessRow } from './QuickAccessRow';
import { SignalPillRow } from './SignalPillRow';
import { CoachingCallout } from './CoachingCallout';

type PanelId = 'training' | 'metrics' | 'progress' | null;

interface SignalHeroProps {
  signal: {
    displayName: string;
    subtitle: string;
    color: string;
    heroBackground: string;
    arcOpacity: { large: number; medium: number; small: number };
    pillBackground: string;
    barRgba: string;
    coachingColor: string;
    pills: { label: string; subLabel: string }[];
    coaching: string;
    showUrgencyBadge: boolean;
    urgencyLabel: string | null;
  };
  activePanel: PanelId;
  onPanelPress: (panel: PanelId) => void;
}

export function SignalHero({ signal, activePanel, onPanelPress }: SignalHeroProps) {
  return (
    <View style={[styles.container, { backgroundColor: signal.heroBackground }]}>
      {/* Quick access pills + date */}
      <QuickAccessRow
        activePanel={activePanel}
        onPanelPress={onPanelPress}
        signalColor={signal.color}
        showUrgencyBadge={signal.showUrgencyBadge}
        urgencyLabel={signal.urgencyLabel}
      />

      {/* Arc icon + signal name */}
      <View style={styles.arcRow}>
        <SignalArcIcon
          color={signal.color}
          arcOpacity={signal.arcOpacity}
        />
        <View style={styles.nameBlock}>
          <Text style={[styles.signalName, { color: signal.color }]}>
            {signal.displayName}
          </Text>
          <Text style={[styles.subtitle, { color: signal.color + '88' }]}>
            {signal.subtitle}
          </Text>
        </View>
      </View>

      {/* Metric pills */}
      <SignalPillRow
        pills={signal.pills}
        pillBackground={signal.pillBackground}
        signalColor={signal.color}
      />

      {/* Coaching callout */}
      <CoachingCallout
        coaching={signal.coaching}
        barColor={signal.barRgba}
        coachingColor={signal.coachingColor}
        signalColor={signal.color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(122,155,118,0.12)',
  },
  arcRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginBottom: 12,
  },
  nameBlock: {
    flex: 1,
  },
  signalName: {
    fontFamily: fontFamily.bold,
    fontSize: 25,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    marginTop: 2,
  },
});
