/**
 * CapsuleDayPicker — day-of-week multi-select on Tomo chat tokens.
 * Seven equal-flex hairline pills, sage fill when selected.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../../tomo';

const DAYS = [
  { id: 0, short: 'Sun' },
  { id: 1, short: 'Mon' },
  { id: 2, short: 'Tue' },
  { id: 3, short: 'Wed' },
  { id: 4, short: 'Thu' },
  { id: 5, short: 'Fri' },
  { id: 6, short: 'Sat' },
];

interface CapsuleDayPickerProps {
  label?: string;
  selected: number[];
  onChange: (days: number[]) => void;
}

export function CapsuleDayPicker({
  label,
  selected,
  onChange,
}: CapsuleDayPickerProps) {
  const toggle = (day: number) => {
    if (selected.includes(day)) {
      onChange(selected.filter((d) => d !== day));
    } else {
      onChange([...selected, day].sort());
    }
  };
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {DAYS.map((day) => {
          const sel = selected.includes(day.id);
          return (
            <Pressable
              key={day.id}
              onPress={() => toggle(day.id)}
              style={[
                styles.pill,
                { borderColor: sel ? T.sage : T.cream10 },
                sel && { backgroundColor: T.sage08 },
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
                {day.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 9.5,
    color: T.cream55,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
