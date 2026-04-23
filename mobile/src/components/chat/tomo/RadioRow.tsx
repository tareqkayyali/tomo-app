import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from './tokens';

export function RadioRow({
  title,
  sub,
  selected,
  onPress,
  disabled,
  last,
}: {
  title: string;
  sub?: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.row, !last && styles.rowDivider, disabled && styles.rowDisabled]}
    >
      <View style={[styles.radio, { borderColor: selected ? T.sage : T.cream15 }]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: selected ? T.sageLight : T.cream }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {!!sub && (
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: T.cream06,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: T.sage,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    fontFamily: T.fontMedium,
    letterSpacing: -0.1,
  },
  sub: {
    fontSize: 11,
    fontFamily: T.fontLight,
    color: T.cream55,
    marginTop: 1,
  },
});
