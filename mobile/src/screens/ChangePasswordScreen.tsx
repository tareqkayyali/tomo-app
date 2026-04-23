/**
 * Change Password Screen
 * Allows signed-in users to update their password
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import {
  spacing,
  fontFamily,
  borderRadius,
  screenBg,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { changePassword } from '../services/auth';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = useCallback(async () => {
    setError('');
    if (!currentPassword.trim()) { setError('Enter your current password'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (currentPassword === newPassword) { setError('New password must be different from current'); return; }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => navigation.goBack(), 1500);
    } catch (e: any) {
      setError(e?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword, navigation]);

  if (success) {
    return (
      <PlayerScreen label="ACCOUNT" title="Change password" onBack={() => navigation.goBack()} scroll={false}>
        <View style={styles.successContainer}>
          <SmartIcon name="checkmark-circle" size={64} color={colors.success} />
          <Text style={styles.successTitle}>Password Changed</Text>
          <Text style={styles.successSub}>Redirecting back...</Text>
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen label="ACCOUNT" title="Change password" onBack={() => navigation.goBack()} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.form}>
          {/* Current Password */}
          <Text style={styles.label}>Current Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              placeholder="Enter current password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
              <SmartIcon name={showCurrent ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* New Password */}
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
              <SmartIcon name={showNew ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Confirm New Password */}
          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showNew}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          {/* Password strength indicator */}
          {newPassword.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={[styles.strengthBar, { backgroundColor: newPassword.length >= 8 ? colors.accent : colors.textSecondary, width: `${Math.min(100, (newPassword.length / 12) * 100)}%` }]} />
              <Text style={[styles.strengthText, { color: newPassword.length >= 8 ? colors.accent : colors.textSecondary }]}>
                {newPassword.length < 8 ? 'Too short' : newPassword.length < 12 ? 'Good' : 'Strong'}
              </Text>
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={styles.errorBanner}>
              <SmartIcon name="alert-circle" size={18} color={colors.textSecondary} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Save Button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Update Password'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </PlayerScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: screenBg },
    content: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.textOnDark },
    form: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    label: {
      fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.textMuted,
      marginBottom: 6, marginTop: spacing.md,
    },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.inputBackground, borderRadius: borderRadius.md,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1, fontFamily: fontFamily.regular, fontSize: 15,
      color: colors.textOnDark, paddingVertical: 14,
    },
    eyeBtn: { padding: 8 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
    strengthBar: { height: 3, borderRadius: 2, minWidth: 20 },
    strengthText: { fontFamily: fontFamily.medium, fontSize: 12 },
    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.secondarySubtle, borderRadius: borderRadius.md,
      padding: 12, marginTop: spacing.md,
    },
    errorText: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary, flex: 1 },
    saveBtn: {
      backgroundColor: colors.accent1, borderRadius: borderRadius.md,
      paddingVertical: 14, alignItems: 'center', marginTop: spacing.xl,
    },
    saveBtnText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.textPrimary },
    successContainer: {
      flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    successTitle: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.textOnDark },
    successSub: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textMuted },
  });
}
