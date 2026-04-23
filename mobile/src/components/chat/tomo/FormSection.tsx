import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Small uppercase section label above a group of RadioRows / chip rows.
 */
export function FormSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 9.5,
    fontFamily: T.fontMedium,
    color: T.cream55,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
});
