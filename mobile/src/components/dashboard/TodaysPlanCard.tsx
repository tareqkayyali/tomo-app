/**
 * TodaysPlanCard — Adapted session card for today.
 *
 * Shows the training session adapted by the active signal.
 * Icon container tint changes based on signal color family.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { fontFamily } from '../../theme/typography';

interface TodaysPlanCardProps {
  sessionName: string;
  sessionMeta: string;
  signalColor: string;
}

function ProgramGridIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20}>
      <Rect x={3} y={3} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={13} y={3} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={3} y={13} width={8} height={8} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1={17} y1={15} x2={17} y2={19} stroke={color} strokeWidth={1.5} />
      <Line x1={15} y1={17} x2={19} y2={17} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function TodaysPlanCard({ sessionName, sessionMeta, signalColor }: TodaysPlanCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: `${signalColor}1A` }]}>
        <ProgramGridIcon color={signalColor} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.sessionName}>{sessionName}</Text>
        <Text style={styles.sessionMeta}>{sessionMeta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 14,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
  },
  sessionName: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#E5EBE8',
    marginBottom: 2,
  },
  sessionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: '#7A8D7E',
  },
});
