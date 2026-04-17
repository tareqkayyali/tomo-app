/**
 * CustomCardSection — Freeform headline + body + optional CTA.
 *
 * Config:
 *   headline_template: string — supports {field} interpolation (resolved on server)
 *   body_template: string — supports {field} interpolation (resolved on server)
 *   cta_label: string | null — button label
 *   cta_route: string | null — navigation route (future use)
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius } from '../../../theme/spacing';
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

  // Client-side interpolation for config templates.
  // Build a derived context with common computed fields that the server-side
  // flat context provides (first_name, coaching_summary, etc.) so templates
  // resolve correctly even when the raw boot payload doesn't carry them.
  const snapshot = bootData.snapshot ?? {};
  const derivedContext: Record<string, unknown> = {
    first_name: (bootData as any).name?.split(' ')[0] ?? 'Athlete',
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
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {resolvedHeadline ? (
        <Text style={[styles.headline, { color: colors.chalk }]}>{resolvedHeadline}</Text>
      ) : null}
      {resolvedBody ? (
        <Text style={[styles.body, { color: colors.chalkDim }]}>{resolvedBody}</Text>
      ) : null}
      {coachingText ? (
        <Text style={[styles.coaching, { color: colors.chalkDim }]}>{coachingText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 18,
  },
  headline: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    marginBottom: 6,
  },
  body: {
    fontFamily: fontFamily.note,
    fontSize: 14,
    lineHeight: 20,
  },
  coaching: {
    fontFamily: fontFamily.note,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
});
