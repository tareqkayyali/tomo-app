import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Bold diagnostic sentence, 20px/600.
 * Use an em-dash to join verdict + nuance:
 *   "You're elite in power — but sprint speed is holding you back."
 */
export function TomoTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontFamily: T.fontSemiBold,
    color: T.cream,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginTop: 6,
    marginBottom: 8,
  },
});
