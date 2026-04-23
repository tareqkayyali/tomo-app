/**
 * CapsuleStepper — +/- number input on the Tomo chat primitive tokens.
 * Hairline circle buttons, tabular value, uppercase mini-label.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../../tomo';

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
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  step = 1,
  unit,
}: CapsuleStepperProps) {
  const canDec = value - step >= min;
  const canInc = value + step <= max;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => canDec && onChange(value - step)}
          style={[styles.btn, !canDec && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, !canDec && styles.btnTextDisabled]}>−</Text>
        </Pressable>
        <Text style={styles.value}>
          {value}
          {unit ? ` ${unit}` : ''}
        </Text>
        <Pressable
          onPress={() => canInc && onChange(value + step)}
          style={[styles.btn, !canInc && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, !canInc && styles.btnTextDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 9.5,
    color: T.cream55,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.cream10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: {
    fontFamily: T.fontMedium,
    fontSize: 16,
    color: T.sageLight,
    lineHeight: 18,
  },
  btnTextDisabled: { color: T.cream40 },
  value: {
    fontFamily: T.fontMedium,
    fontSize: 14,
    color: T.cream,
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
});
