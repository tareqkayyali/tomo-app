/**
 * CapsuleSubmitButton — Subtle dark button matching the unified capsule style.
 * Uses the "Ask Tomo" pattern: dark bg, thin border, compact.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../../../../theme/colors';
import { Loader } from '../../../Loader';
import { borderRadius, fontFamily, spacing } from '../../../../theme';

interface CapsuleSubmitButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'subtle' | 'danger';
}

export function CapsuleSubmitButton({ title, onPress, disabled, loading, variant = 'primary' }: CapsuleSubmitButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isDanger ? styles.buttonDanger : isPrimary ? styles.buttonPrimary : styles.buttonSubtle,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <Loader size="sm" />
      ) : (
        <Text style={[
          styles.buttonText,
          isDanger ? styles.textDanger : isPrimary ? styles.textPrimary : styles.textSubtle,
          disabled && styles.textDisabled,
        ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: 4,
  },
  buttonPrimary: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  buttonSubtle: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  textPrimary: {
    color: colors.accent1,
  },
  textSubtle: {
    color: colors.accent2,
  },
  textDisabled: {
    color: colors.textInactive,
  },
  buttonDanger: {
    backgroundColor: colors.secondarySubtle,
    borderWidth: 1,
    borderColor: colors.secondaryMuted,
  },
  textDanger: {
    color: colors.textSecondary,
  },
});
