/**
 * QuickAccessRow — 3 pill buttons (Program, Metrics, Progress) + date display.
 *
 * Sits at the top of the hero. Tapping a pill opens its slide-up panel.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Polyline, Path } from 'react-native-svg';
import { fontFamily } from '../../theme/typography';

type PanelId = 'training' | 'metrics' | 'progress' | null;

interface QuickAccessRowProps {
  activePanel: PanelId;
  onPanelPress: (panel: PanelId) => void;
  signalColor: string;
  showUrgencyBadge: boolean;
  urgencyLabel: string | null;
  urgencyColor?: string;
}

function formatDate() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

// Custom SVG icons (stroke-based, matching spec)
function ProgramIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={13} height={13}>
      <Rect x={5} y={3} width={14} height={18} rx={2} stroke={color} strokeWidth={1.8} fill="none" />
      <Line x1={9} y1={8} x2={15} y2={8} stroke={color} strokeWidth={1.5} />
      <Line x1={9} y1={12} x2={15} y2={12} stroke={color} strokeWidth={1.5} />
      <Line x1={9} y1={16} x2={13} y2={16} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function MetricsIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={13} height={13}>
      <Rect x={4} y={13} width={4} height={8} rx={1} stroke={color} strokeWidth={1.8} fill="none" />
      <Rect x={10} y={8} width={4} height={13} rx={1} stroke={color} strokeWidth={1.8} fill="none" />
      <Rect x={16} y={3} width={4} height={18} rx={1} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

function ProgressIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={13} height={13}>
      <Polyline
        points="4,18 10,12 14,15 20,6"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M17 6 L20 6 L20 9" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const PILLS: { id: PanelId; label: string; Icon: React.FC<{ color: string }> }[] = [
  { id: 'training', label: 'Program', Icon: ProgramIcon },
  { id: 'metrics', label: 'Metrics', Icon: MetricsIcon },
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
];

export function QuickAccessRow({
  activePanel,
  onPanelPress,
  signalColor,
  showUrgencyBadge,
  urgencyLabel,
  urgencyColor = '#A05A4A',
}: QuickAccessRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.pillsRow}>
        {PILLS.map(({ id, label, Icon }) => {
          const isActive = activePanel === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.pill,
                {
                  backgroundColor: isActive
                    ? `${signalColor}33`
                    : `${signalColor}17`,
                  borderColor: isActive
                    ? `${signalColor}73`
                    : `${signalColor}38`,
                },
              ]}
              onPress={() => onPanelPress(isActive ? null : id)}
              activeOpacity={0.7}
            >
              <Icon color={signalColor} />
              <Text style={[styles.pillLabel, { color: signalColor }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.rightSide}>
        {showUrgencyBadge && urgencyLabel && (
          <View style={[styles.urgencyBadge, { backgroundColor: `${urgencyColor}26` }]}>
            <Text style={[styles.urgencyText, { color: urgencyColor }]}>
              {urgencyLabel}
            </Text>
          </View>
        )}
        <Text style={[styles.dateText, { color: 'rgba(255,255,255,0.40)' }]}>
          {formatDate()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
  },
  rightSide: {
    alignItems: 'flex-end',
  },
  urgencyBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 3,
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
  },
});
