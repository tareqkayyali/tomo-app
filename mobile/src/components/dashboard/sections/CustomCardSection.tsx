/**
 * CustomCardSection — Freeform headline + body + optional CTA.
 *
 * Config:
 *   headline_template: string — supports {field} interpolation (resolved on server)
 *   body_template: string — supports {field} interpolation (resolved on server)
 *   cta_label: string | null — button label
 *   cta_route: string | null — navigation route (future use)
 *   color_hint: string | null — optional accent color for headline / badge
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import type { SectionProps } from './DashboardSectionRenderer';

export const CustomCardSection = memo(function CustomCardSection({
  config,
  coachingText,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();

  // Templates are already interpolated server-side in coaching_text,
  // but config may also have raw templates for additional content
  const headline = (config.headline_template as string) ?? '';
  const body = (config.body_template as string) ?? '';
  const colorHint = (config.color_hint as string | null) ?? null;
  const accentColor = colorHint ?? colors.tomoSage;

  // Client-side interpolation for config templates.
  // Build a derived context with common computed fields that the server-side
  // flat context provides (first_name, coaching_summary, etc.) so templates
  // resolve correctly even when the raw boot payload doesn't carry them.
  const snapshot = bootData.snapshot ?? {};
  const derivedContext: Record<string, unknown> = {
    first_name: (bootData as any).name?.split(' ')[0] || 'Athlete',
    coaching_summary: (bootData as any).signalContext?.coaching ?? '',
    sport: (bootData as any).sport ?? '',
    position: (bootData as any).position ?? '',
    streak: (bootData as any).streak ?? 0,
    current_streak: (bootData as any).streak ?? 0,
  };

  function interpolate(template: string): string {
    return template.replace(/\{(\w+)\}/g, (match, field) => {
      // Check derived context first (computed fields like first_name)
      const derivedVal = derivedContext[field];
      if (derivedVal !== undefined && derivedVal !== null && derivedVal !== '') return String(derivedVal);
      // Then boot data top-level
      const bootVal = (bootData as any)[field];
      if (bootVal !== undefined && bootVal !== null) return String(bootVal);
      // Then snapshot
      const snapVal = snapshot[field];
      if (snapVal !== undefined && snapVal !== null) return String(snapVal);
      return match;
    });
  }

  const resolvedHeadline = interpolate(headline);
  const resolvedBody = interpolate(body);

  if (!resolvedHeadline && !resolvedBody && !coachingText) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      {resolvedHeadline ? (
        <View style={styles.headlineRow}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          <Text style={[styles.headline, { color: colors.tomoCream }]}>{resolvedHeadline}</Text>
        </View>
      ) : null}
      {resolvedBody ? (
        <Text style={[styles.body, { color: colors.muted }]}>{resolvedBody}</Text>
      ) : null}
      {coachingText ? (
        <Text style={[styles.coaching, { color: colors.muted }]}>{coachingText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  accentBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  headline: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.2,
    flex: 1,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  coaching: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
});
