/**
 * CapsuleToggle — on/off switch on the Tomo chat primitive tokens.
 * Hairline track that fills sage when active; no shadow, no chrome.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../../tomo';

interface CapsuleToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

export function CapsuleToggle({
  label,
  value,
  onChange,
  description,
}: CapsuleToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text
          style={[styles.label, { color: value ? T.sageLight : T.cream }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {description ? (
          <Text style={styles.sub} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.track,
          { borderColor: value ? T.sage : T.cream15 },
          value && { backgroundColor: T.sage08 },
        ]}
      >
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: value ? T.sage : T.cream25,
              alignSelf: value ? 'flex-end' : 'flex-start',
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: T.cream06,
  },
  pressed: { opacity: 0.7 },
  text: {
    flex: 1,
  },
  label: {
    fontFamily: T.fontMedium,
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  sub: {
    fontFamily: T.fontLight,
    fontSize: 11,
    color: T.cream55,
    marginTop: 1,
  },
  track: {
    width: 36,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
});
