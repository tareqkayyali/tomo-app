/**
 * LinkAccountScreen — Player enters an invite code to link with a coach or parent.
 * Clean, centered UI with a 6-character code input and confirmation.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../hooks/useTheme';
import { acceptInviteCode } from '../services/api';
import { spacing, borderRadius, layout } from '../theme';
import type { ThemeColors } from '../theme/colors';

export function LinkAccountScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ guardianId: string; relationshipType: string } | null>(null);

  const isValid = code.trim().length === 6;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const res = await acceptInviteCode(code.trim().toUpperCase());
      setSuccess({ guardianId: res.guardianId, relationshipType: res.relationshipType });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired code';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.inner}>
          <View style={[styles.successIcon, { backgroundColor: colors.accentMuted }]}>
            <SmartIcon name="checkmark-circle" size={48} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.textOnDark }]}>Linked!</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            You&apos;re now connected with your {success.relationshipType}.
            They can view your progress and send suggestions.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: colors.accent1, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SmartIcon name="link-outline" size={48} color={colors.accent1} style={styles.icon} />
        <Text style={[styles.title, { color: colors.textOnDark }]}>Link Account</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Enter the 6-character invite code from your coach or parent to link your accounts.
        </Text>

        <TextInput
          style={[
            styles.codeInput,
            {
              backgroundColor: colors.surfaceElevated,
              color: colors.textOnDark,
              borderColor: isValid ? colors.accent1 : colors.border,
            },
          ]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={colors.textInactive}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          textAlign="center"
        />

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || loading}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: isValid ? colors.accent1 : colors.surfaceElevated,
              opacity: pressed || loading ? 0.7 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: isValid ? colors.textPrimary : colors.textInactive }]}>
              Link Account
            </Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    inner: {
      flex: 1,
      padding: layout.screenMargin,
      justifyContent: 'center',
      alignItems: 'center',
    },
    icon: {
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: 15,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    codeInput: {
      width: '80%',
      maxWidth: 280,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 6,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 2,
      marginBottom: spacing.lg,
    },
    submitButton: {
      width: '80%',
      maxWidth: 280,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
    },
    submitText: {
      fontSize: 16,
      fontWeight: '600',
    },
    successIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    doneButton: {
      paddingHorizontal: spacing.xxl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      marginTop: spacing.lg,
    },
    doneButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
