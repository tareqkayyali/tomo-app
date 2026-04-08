/**
 * SignalHero — The hero section of the Dashboard.
 *
 * Compact layout: Arc icon left-aligned with signal name inline.
 * No full-width background overlay — just the arc icon gets color.
 * Clean, minimal, dark theme with signal color accents only.
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
    <View style={styles.container}>
      {/* Quick access pills + date */}
      <QuickAccessRow
        activePanel={activePanel}
        onPanelPress={onPanelPress}
        signalColor={signal.color}
        showUrgencyBadge={signal.showUrgencyBadge}
        urgencyLabel={signal.urgencyLabel}
      />

      {/* Arc icon + signal name — compact inline layout */}
      <View style={styles.signalRow}>
        <View style={styles.arcContainer}>
          <SignalArcIcon
            color={signal.color}
            arcOpacity={signal.arcOpacity}
          />
        </View>
        <View style={styles.nameBlock}>
          <Text style={[styles.signalName, { color: signal.color }]}>
            {signal.displayName}
          </Text>
          <Text style={styles.subtitle}>
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
    // No full-width hero background — stays on page bg
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  arcContainer: {
    // Arc icon only gets the signal tint — no background overlay
  },
  nameBlock: {
    flex: 1,
  },
  signalName: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
});
