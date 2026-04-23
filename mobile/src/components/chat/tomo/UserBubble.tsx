import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Right-aligned receipt of what the user said or confirmed.
 * Renders typed prompts AND machine-emitted flow receipts
 * (e.g. "Week set", "Study plan set").
 */
export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    marginBottom: 8,
  },
  bubble: {
    maxWidth: 280,
    backgroundColor: T.cream04,
    borderWidth: 1,
    borderColor: T.cream06,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 13,
    fontFamily: T.fontRegular,
    color: T.cream70,
    letterSpacing: -0.05,
    lineHeight: 18,
  },
});
