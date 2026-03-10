/**
 * Input Component
 * Tomo Design System — pill-shaped input on dark background
 *
 * - Pill shape: border-radius 24px
 * - White #FFFFFF background
 * - Left icon slot + right icon slot (optional)
 * - Orange focus ring
 * - Sits on #1A1D2E dark background
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  /** Left icon (e.g., search, mail) */
  iconLeft?: keyof typeof Ionicons.glyphMap;
  /** Right icon (e.g., eye, close) */
  iconRight?: keyof typeof Ionicons.glyphMap;
  /** Right icon press handler */
  onPressRight?: () => void;
}

export function Input({
  label,
  error,
  containerStyle,
  iconLeft,
  iconRight,
  onPressRight,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          isFocused && styles.inputFocused,
          error && styles.inputError,
        ]}
      >
        {iconLeft && (
          <Ionicons
            name={iconLeft}
            size={20}
            color={colors.textInactive}
            style={styles.iconLeft}
          />
        )}
        <TextInput
          style={[styles.input, !iconLeft && styles.inputNoLeftIcon]}
          placeholderTextColor={colors.textInactive}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {iconRight && (
          <Pressable onPress={onPressRight} hitSlop={8}>
            <Ionicons
              name={iconRight}
              size={20}
              color={colors.textInactive}
              style={styles.iconRight}
            />
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground, // #FFFFFF
    borderRadius: borderRadius.xl,            // 24px pill
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputFocused: {
    borderColor: colors.accent1,
  },
  inputError: {
    borderColor: colors.error,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textOnLight,
    paddingVertical: spacing.compact,
  },
  inputNoLeftIcon: {
    paddingLeft: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
    marginLeft: spacing.md,
  },
});
