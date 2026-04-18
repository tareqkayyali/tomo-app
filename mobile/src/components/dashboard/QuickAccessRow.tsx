/**
 * QuickAccessRow — Top strip of the Dashboard hero.
 *
 * Layout:
 *   Row 1: date (right-aligned) + optional urgency badge
 *   Row 2: underline tab switcher (Program | Metrics | Progress)
 *
 * Tapping a tab opens its slide-up panel. Tapping the same tab again closes it
 * (panel toggle). When nothing is open, the indicator retracts.
 *
 * Uses the shared `UnderlineTabSwitcher` primitive for visual parity with the
 * Output screen's tab switcher.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';
import { UnderlineTabSwitcher, type UnderlineTab } from '../UnderlineTabSwitcher';

type PanelId = 'training' | 'metrics' | 'progress' | null;
type TabId = 'training' | 'metrics' | 'progress';

interface QuickAccessRowProps {
  activePanel: PanelId;
  onPanelPress: (panel: PanelId) => void;
  signalColor: string;
  showUrgencyBadge: boolean;
  urgencyLabel: string | null;
  urgencyColor?: string;
}

const TABS: UnderlineTab<TabId>[] = [
  { key: 'training', label: 'Program' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'progress', label: 'Progress' },
];

function formatDate() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export function QuickAccessRow({
  activePanel,
  onPanelPress,
  signalColor,
  showUrgencyBadge,
  urgencyLabel,
  urgencyColor = '#A05A4A',
}: QuickAccessRowProps) {
  const activeTab: TabId | 'none' = activePanel ?? 'none';
  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        {showUrgencyBadge && urgencyLabel ? (
          <View style={[styles.urgencyBadge, { backgroundColor: `${urgencyColor}26` }]}>
            <Text style={[styles.urgencyText, { color: urgencyColor }]}>
              {urgencyLabel}
            </Text>
          </View>
        ) : (
          <View />
        )}
        <Text style={styles.dateText}>{formatDate()}</Text>
      </View>

      <UnderlineTabSwitcher<TabId | 'none'>
        tabs={TABS as UnderlineTab<TabId | 'none'>[]}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'none') return;
          // Toggle: tap the active tab again to close the panel.
          onPanelPress((activePanel === tab ? null : tab) as PanelId);
        }}
        accentColor={signalColor}
        inactiveColor="rgba(255,255,255,0.40)"
        borderColor="rgba(255,255,255,0.06)"
        paddingHorizontal={0}
        marginBottom={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    minHeight: 16,
  },
  urgencyBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  urgencyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateText: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: 'rgba(255,255,255,0.40)',
  },
});
