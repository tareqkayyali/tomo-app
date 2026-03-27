/**
 * CapsuleNumberInput — Number input with unit suffix for capsule forms.
 * Follows the app's no-visible-border input pattern.
 */

import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { colors } from '../../../../theme/colors';
import { spacing, borderRadius } from '../../../../theme';
import { fontFamily } from '../../../../theme';

interface CapsuleNumberInputProps {
  value: string;
  onChangeText?: (text: string) => void;
  onChange?: (text: string) => void;
  unit?: string;
  placeholder?: string;
  label?: string;
}

export function CapsuleNumberInput({ value, onChangeText, onChange, unit, placeholder, label }: CapsuleNumberInputProps) {
  const handleChange = onChangeText ?? onChange ?? (() => {});
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder ?? '0'}
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.compact,
    minHeight: 40,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  unit: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
    marginLeft: spacing.sm,
  },
});
