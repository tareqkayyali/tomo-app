/**
 * DashboardCard — Shared card surface for the three Dashboard slide-up panels.
 *
 * Uses the centralised `panel*` theme tokens so all card surfaces stay in
 * lock-step visually. Pass an optional `label` to render the small uppercase
 * section label at the top (replaces the old ad-hoc `cardLabel` pattern that
 * was duplicated across ProgramPanel / MetricsPanel / ProgressPanel).
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

interface Props {
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function DashboardCard({ label, style, children }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.panelSurface, borderColor: colors.panelBorder },
        style,
      ]}
    >
      {label && (
        <Text style={[styles.label, { color: colors.panelLabel }]}>{label}</Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
});
