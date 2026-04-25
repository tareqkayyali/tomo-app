import React from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from './tokens';
import { SphereButton } from '../../tomo-ui/SphereButton';

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
  if (tone === 'primary') {
    return (
      <SphereButton
        label={typeof children === 'string' ? children : ''}
        onPress={onPress ?? (() => {})}
        disabled={disabled}
        style={{ marginTop: 10, ...style }}
      />
    );
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.mutedShell,
        disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      <Text style={[styles.label, { color: T.sageLight }]} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    marginTop: 10,
    borderRadius: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    overflow: 'hidden',
  },
  primaryShell: {
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.16)',
    shadowColor: '#7A9B76',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  mutedShell: {
    backgroundColor: 'rgba(154,184,150,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.12)',
  },
  primaryWrap: {
    width: '100%',
    minHeight: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.22)',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  label: {
    fontSize: 14,
    fontFamily: T.fontMedium,
    letterSpacing: 0.2,
  },
});
