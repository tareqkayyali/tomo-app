/**
 * CoachingCallout — AI coaching text with left accent bar.
 *
 * "tomo ai" eyebrow + coaching text interpolated from signal context.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';

interface CoachingCalloutProps {
  coaching: string;
  barColor: string;
  coachingColor: string;
  signalColor: string;
}

export function CoachingCallout({ coaching, barColor, coachingColor, signalColor }: CoachingCalloutProps) {
  return (
    <View style={[styles.container, { borderLeftColor: barColor }]}>
      <Text style={[styles.eyebrow, { color: signalColor + '80' }]}>TOMO AI</Text>
      <Text style={[styles.text, { color: coachingColor }]}>{coaching}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    paddingLeft: 10,
  },
  eyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 7,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  text: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 18,
  },
});
