/**
 * DashboardCard — Shared card surface for the three Dashboard slide-up panels.
 *
 * Delegates rendering to the canonical `GlassCard` primitive used on the
 * Timeline and elsewhere, so all cards across the app share ONE surface
 * treatment (`colors.surface` + `colors.border` + `borderRadius.lg` +
 * `spacing.lg` padding).
 *
 * Adds an optional `label` slot for the small uppercase section labels that
 * Dashboard panels use above their content (e.g. "HRV", "THIS MONTH"). When
 * `label` is omitted, behaves identically to `<GlassCard>`.
 */

import React from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { GlassCard } from '../../GlassCard';
import { fontFamily } from '../../../theme/typography';
import { spacing } from '../../../theme';
import { useTheme } from '../../../hooks/useTheme';

interface Props {
  label?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function DashboardCard({ label, style, children }: Props) {
  const { colors } = useTheme();
  const mergedStyle: ViewStyle = { marginBottom: spacing.sm, ...(style ?? {}) };
  return (
    <GlassCard style={mergedStyle}>
      {label && (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      )}
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
});
