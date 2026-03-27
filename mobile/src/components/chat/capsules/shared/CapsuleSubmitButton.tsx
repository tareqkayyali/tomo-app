/**
 * CapsuleSubmitButton — Subtle dark button matching the unified capsule style.
 * Uses the "Ask Tomo" pattern: dark bg, thin border, compact.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors } from '../../../../theme/colors';
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
        <ActivityIndicator size="small" color={isDanger ? '#fff' : isPrimary ? '#fff' : colors.accent2} />
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
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  buttonSubtle: {
    backgroundColor: 'rgba(0, 217, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.2)',
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
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
  },
  textDanger: {
    color: '#E74C3C',
  },
});
