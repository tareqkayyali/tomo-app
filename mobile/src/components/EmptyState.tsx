/**
 * EmptyState Component
 * Tomo Design System — reusable empty state with icon, title, subtitle, CTA button
 *
 * Renders on #1A1D2E dark background with white text.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';
import { Button } from './Button';
import { colors, spacing, typography, fontFamily } from '../theme';

interface EmptyStateProps {
  /** Ionicons icon name */
  icon: keyof typeof Ionicons.glyphMap;
  /** Icon color (default accent1) */
  iconColor?: string;
  /** Main title */
  title: string;
  /** Supporting subtitle */
  subtitle?: string;
  /** CTA button label */
  ctaLabel?: string;
  /** CTA button press handler */
  onCtaPress?: () => void;
  /** Additional style */
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  iconColor = colors.textInactive,
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <SmartIcon name={icon} size={56} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {ctaLabel && onCtaPress && (
        <Button
          title={ctaLabel}
          onPress={onCtaPress}
          variant="secondary"
          size="medium"
          style={styles.ctaButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textInactive,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaButton: {
    marginTop: spacing.lg,
    minWidth: 160,
  },
});
