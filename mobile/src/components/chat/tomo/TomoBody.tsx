import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * One paragraph of reasoning. 13.5px/300. Never two paragraphs —
 * split into a new turn.
 */
export function TomoBody({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

const styles = StyleSheet.create({
  body: {
    fontSize: 13.5,
    fontFamily: T.fontLight,
    color: T.cream70,
    lineHeight: 20,
    letterSpacing: -0.02,
    marginBottom: 12,
  },
});
