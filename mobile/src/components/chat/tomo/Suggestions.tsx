import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Follow-up prompts the user is likely to tap next. Reads as a
 * continuing sentence, not a CTA row. 2–4 items.
 * Banned: "Learn more" / "Continue" / "Click here".
 */
export function Suggestions({
  items,
  onPick,
}: {
  items: string[];
  onPick?: (label: string) => void;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <View style={styles.row}>
      {items.map((t, i) => (
        <Pressable
          key={`${t}-${i}`}
          onPress={onPick ? () => onPick(t) : undefined}
          hitSlop={6}
        >
          <Text style={styles.item}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 20,
    marginBottom: 14,
  },
  item: {
    fontSize: 13,
    fontFamily: T.fontRegular,
    color: T.sageLight,
    lineHeight: 20,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderBottomColor: T.sage30,
    paddingBottom: 1,
  },
});
