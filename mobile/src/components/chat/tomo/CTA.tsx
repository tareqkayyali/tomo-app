import React from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const isPrimary = tone === 'primary';
  const color = '#F5F3ED';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.primaryShell : styles.mutedShell,
        disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      {isPrimary ? (
        <View style={styles.primaryWrap}>
          <LinearGradient
            colors={['#C8DCC3', '#9AB896', '#7A9B76', '#4F6B4C']}
            locations={[0, 0.35, 0.7, 1]}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['rgba(245,243,237,0.18)', 'rgba(245,243,237,0.05)', 'transparent']}
            locations={[0, 0.32, 0.65]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.innerBorder} />
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {children}
          </Text>
        </View>
      ) : (
        <Text style={[styles.label, { color: T.sageLight }]} numberOfLines={1}>
          {children}
        </Text>
      )}
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
