/**
 * Input Component
 * Tomo Design System — dark-themed input for dark backgrounds
 *
 * - Pill shape: border-radius 24px
 * - Dark translucent background
 * - Light text on dark
 * - Subtle focus ring
 * - Overrides browser autofill styling on web
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../theme';

/* ── Inject global CSS to override browser autofill on web ────────── */
let autofillCSSInjected = false;
function injectAutofillCSS() {
  if (Platform.OS !== 'web' || autofillCSSInjected) return;
  autofillCSSInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* Override browser autofill background */
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 1000px rgba(20,20,20,1) inset !important;
      box-shadow: 0 0 0 1000px rgba(20,20,20,1) inset !important;
      -webkit-text-fill-color: #FFFFFF !important;
      caret-color: #FFFFFF !important;
      transition: background-color 5000s ease-in-out 0s !important;
    }
    /* Remove all input focus outlines globally */
    input:focus, textarea:focus {
      outline: none !important;
      outline-style: none !important;
    }
  `;
  document.head.appendChild(style);
}

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
  style,
  ...props
}: InputProps & { style?: ViewStyle }) {
  const [isFocused, setIsFocused] = useState(false);

  // Inject autofill CSS override once on web
  useEffect(() => {
    injectAutofillCSS();
  }, []);

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
            color="rgba(255,255,255,0.4)"
            style={styles.iconLeft}
          />
        )}
        <TextInput
          style={[
            styles.input,
            !iconLeft && styles.inputNoLeftIcon,
            // Remove browser default outline on web
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {},
          ]}
          placeholderTextColor="rgba(255,255,255,0.3)"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {iconRight && (
          <Pressable onPress={onPressRight} hitSlop={8}>
            <Ionicons
              name={iconRight}
              size={20}
              color="rgba(255,255,255,0.4)"
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
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.xl,            // 24px pill
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputFocused: {
    borderColor: 'rgba(255,255,255,0.25)',
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
    color: colors.textPrimary,
    paddingVertical: spacing.compact,
    backgroundColor: 'transparent',
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
