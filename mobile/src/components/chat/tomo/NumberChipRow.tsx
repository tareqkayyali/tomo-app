import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * 0..N number chips. Used for session counts per week, set counts, etc.
 */
export function NumberChipRow({
  values = [0, 1, 2, 3, 4, 5],
  selected,
  onPick,
  muted = false,
}: {
  values?: number[];
  selected?: number;
  onPick?: (v: number) => void;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      {values.map((v) => {
        const sel = v === selected;
        return (
          <Pressable
            key={v}
            onPress={onPick ? () => onPick(v) : undefined}
            style={[
              styles.chip,
              { borderColor: sel ? T.sage : T.cream10 },
              sel && { backgroundColor: T.sage08 },
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  color: sel
                    ? T.sageLight
                    : muted
                    ? T.cream25
                    : T.cream70,
                  fontFamily: sel ? T.fontMedium : T.fontRegular,
                },
              ]}
            >
              {v}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  chip: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
  },
});
