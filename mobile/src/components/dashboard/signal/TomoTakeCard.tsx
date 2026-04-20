/**
 * TomoTakeCard — the quiet closing card on the Signal Dashboard.
 *
 * Sage-tinted surface with a glowing dot + uppercase "TOMO'S TAKE" eyebrow
 * and the signal's coaching line as body copy. Intentionally low-contrast
 * and non-interactive — it's the end-of-scroll reassurance moment.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

interface Props {
  message: string;
}

export function TomoTakeCard({ message }: Props) {
  const { colors } = useTheme();
  if (!message) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.accentSubtle,
          borderColor: colors.accentBorder,
        },
      ]}
    >
      <View style={styles.eyebrowRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: colors.accent, shadowColor: colors.accent },
          ]}
        />
        <Text style={[styles.eyebrow, { color: colors.accentLight }]}>
          TOMO&apos;S TAKE
        </Text>
      </View>
      <Text style={[styles.body, { color: colors.textBody }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: fontFamily.light,
    fontSize: 12,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
});
