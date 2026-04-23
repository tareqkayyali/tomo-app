import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Pill chips. Used for durations ("30m", "45m", "1h"), intensity, mode, etc.
 */
export function PillChipRow<V extends string | number>({
  values,
  selected,
  onPick,
  labelOf,
  disabledValues,
}: {
  values: V[];
  selected?: V;
  onPick?: (v: V) => void;
  labelOf?: (v: V) => string;
  disabledValues?: V[];
}) {
  return (
    <View style={styles.row}>
      {values.map((v) => {
        const sel = v === selected;
        const disabled = disabledValues?.includes(v);
        const label = labelOf ? labelOf(v) : String(v);
        return (
          <Pressable
            key={String(v)}
            onPress={disabled || !onPick ? undefined : () => onPick(v)}
            style={[
              styles.pill,
              { borderColor: sel ? T.sage : T.cream10 },
              sel && { backgroundColor: T.sage08 },
              disabled && styles.pillDisabled,
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  color: sel ? T.sageLight : T.cream70,
                  fontFamily: sel ? T.fontMedium : T.fontRegular,
                },
              ]}
            >
              {label}
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
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDisabled: {
    opacity: 0.35,
  },
  text: {
    fontSize: 12,
  },
});
