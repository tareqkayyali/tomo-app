/**
 * CapsuleStepper — +/- number input for capsule forms.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../../theme';

interface CapsuleStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function CapsuleStepper({
  label, value, onChange, min = 1, max = 10, step = 1, unit
}: CapsuleStepperProps) {
  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => canDecrement && onChange(value - step)}
          style={[styles.button, !canDecrement && styles.buttonDisabled]}
        >
          <Text style={[styles.buttonText, !canDecrement && styles.buttonTextDisabled]}>−</Text>
        </Pressable>
        <Text style={styles.value}>
          {value}{unit ? ` ${unit}` : ''}
        </Text>
        <Pressable
          onPress={() => canIncrement && onChange(value + step)}
          style={[styles.button, !canIncrement && styles.buttonDisabled]}
        >
          <Text style={[styles.buttonText, !canIncrement && styles.buttonTextDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textInactive,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.chipBackground,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.3 },
  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.accent1,
    lineHeight: 20,
  },
  buttonTextDisabled: { color: colors.textInactive },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    minWidth: 50,
    textAlign: 'center',
  },
});
