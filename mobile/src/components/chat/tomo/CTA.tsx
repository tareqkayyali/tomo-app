import React from 'react';
import { Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { T } from './tokens';

/**
 * Full-width action. 'muted' = next step ("Next · training mix"),
 * 'primary' = final lock-in.
 */
export function CTA({
  children,
  tone = 'muted',
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'primary';
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = tone === 'primary' ? T.sage : 'rgba(154,184,150,0.10)';
  const color = tone === 'primary' ? T.ink : T.sageLight;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: bg },
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 13.5,
    fontFamily: T.fontMedium,
    letterSpacing: -0.1,
  },
});
