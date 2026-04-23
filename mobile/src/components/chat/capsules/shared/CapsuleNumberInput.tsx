/**
 * CapsuleNumberInput — compact number input on Tomo chat tokens.
 * Hairline capsule, right-aligned unit, uppercase mini-label.
 */

import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { T } from '../../tomo';

interface CapsuleNumberInputProps {
  value: string;
  onChangeText?: (text: string) => void;
  onChange?: (text: string) => void;
  unit?: string;
  placeholder?: string;
  label?: string;
}

export function CapsuleNumberInput({
  value,
  onChangeText,
  onChange,
  unit,
  placeholder,
  label,
}: CapsuleNumberInputProps) {
  const handleChange = onChangeText ?? onChange ?? (() => {});
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={T.cream40}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.cream55,
    marginBottom: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.cream03,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.cream10,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  input: {
    flex: 1,
    fontFamily: T.fontRegular,
    fontSize: 13.5,
    color: T.cream,
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: T.fontMedium,
    fontSize: 11,
    color: T.cream55,
    marginLeft: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
