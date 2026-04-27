import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from './tokens';

/**
 * Pill chips. Used for durations ("30m", "45m", "1h"), intensity, mode, etc.
 *
 * `compact` tightens padding/gap so 6–7 pills fit on a single row inside a
 * narrow capsule (e.g. the week-planner's duration row "30m / 45m / 1h /
 * 1h15 / 1h30 / 2h" or the day row "Mon..Sun"). Without it, the last pill
 * orphans onto its own line — which the design treats as a layout bug.
 */
export function PillChipRow<V extends string | number>({
  values,
  selected,
  onPick,
  labelOf,
  disabledValues,
  compact,
}: {
  values: V[];
  selected?: V;
  onPick?: (v: V) => void;
  labelOf?: (v: V) => string;
  disabledValues?: V[];
  compact?: boolean;
}) {
  const rowStyle = compact ? styles.rowCompact : styles.row;
  const pillStyle = compact ? styles.pillCompact : styles.pill;
  const textStyle = compact ? styles.textCompact : styles.text;
  return (
    <View style={rowStyle}>
      {values.map((v) => {
        const sel = v === selected;
        const disabled = disabledValues?.includes(v);
        const label = labelOf ? labelOf(v) : String(v);
        return (
          <Pressable
            key={String(v)}
            onPress={disabled || !onPick ? undefined : () => onPick(v)}
            style={[
              pillStyle,
              { borderColor: sel ? T.sage : T.cream10 },
              sel && { backgroundColor: T.sage08 },
              disabled && styles.pillDisabled,
            ]}
          >
            <Text
              style={[
                textStyle,
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
  rowCompact: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillCompact: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDisabled: {
    opacity: 0.35,
  },
  text: {
    fontSize: 12,
  },
  textCompact: {
    fontSize: 11.5,
  },
});
