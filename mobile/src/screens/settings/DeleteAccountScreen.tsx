/**
 * Delete Account Screen — GDPR Art. 17 user-facing flow.
 *
 * Three states the UI renders:
 *   1. NONE     — user can request deletion. Confirm dialog → POST /delete.
 *   2. PENDING  — shows "X days until permanent deletion" countdown with a
 *                 cancel CTA. POST /delete/cancel unlocks the account.
 *   3. PURGED   — unreachable from mobile in practice (proxy returns 410
 *                 and the app would be signed out), but handled for
 *                 safety so no crash on a weird race.
 *
 * Implementation notes:
 *   - Matches the ChangePasswordScreen styling convention (SafeArea +
 *     header + form), so it slots into the existing Settings stack with
 *     zero additional theming.
 *   - Uses window.alert on web + Alert.alert on native (see MEMORY
 *     feedback_no_alert_alert_web — Alert.alert silently fails on web).
 *   - Emits no emojis. Plain text only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import { spacing, fontFamily, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../hooks/useTheme';
import { apiRequest } from '../../services/api';

// ─── API shape (mirrors backend/services/deletion/deletionService.ts) ─

type DeletionStatusPayload = {
  status: 'none' | 'pending' | 'cancelled' | 'purging' | 'purged' | 'failed';
  requestId: string | null;
  jurisdiction: 'GDPR' | 'CCPA' | 'PDPL' | 'CUSTOM' | null;
  requestedAt: string | null;
  scheduledPurgeAt: string | null;
  gracePeriodDays: number | null;
  daysRemaining: number | null;
  canCancel: boolean;
  method: string | null;
};

type RequestResponse = {
  request: {
    id: string;
    status: string;
    jurisdiction: string;
    requestedAt: string;
    scheduledPurgeAt: string;
    gracePeriodDays: number;
  };
  message: string;
};

// ─── cross-platform confirm dialog ────────────────────────────────────

function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`${title}\n\n${message}`)
          : false
      );
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }
  Alert.alert(title, message);
}

// ─── screen ───────────────────────────────────────────────────────────

export default function DeleteAccountScreen(): React.ReactElement {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [status, setStatus] = useState<DeletionStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DeletionStatusPayload>(
        '/api/v1/user/delete/status'
      );
      setStatus(res);
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not load deletion status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onRequest = useCallback(async () => {
    const ok = await confirmDestructive(
      'Delete account?',
      'Your account will be locked immediately and permanently deleted after 30 days. During the 30-day grace period you can cancel here. After purge, no data can be recovered — including your training history, test results, chat, and CV.',
      'Delete'
    );
    if (!ok) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<RequestResponse>('/api/v1/user/delete', {
        method: 'POST',
        body: JSON.stringify({ jurisdiction: 'GDPR' }),
      });
      notify('Deletion scheduled', res.message);
      await refresh();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not schedule deletion');
    } finally {
      setSubmitting(false);
    }
  }, [refresh]);

  const onCancel = useCallback(async () => {
    const ok = await confirmDestructive(
      'Cancel deletion?',
      'Your account will be unlocked and remain active.',
      'Cancel deletion'
    );
    if (!ok) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/api/v1/user/delete/cancel', { method: 'POST' });
      notify(
        'Deletion cancelled',
        'Your account is active again. Welcome back.'
      );
      await refresh();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not cancel deletion');
    } finally {
      setSubmitting(false);
    }
  }, [refresh]);

  const body = (() => {
    if (loading) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent1} />
        </View>
      );
    }
    if (!status || status.status === 'none' || status.status === 'cancelled') {
      return (
        <View style={styles.section}>
          <SmartIcon name="warning" size={36} color={colors.warning} />
          <Text style={styles.heading}>Delete your account</Text>
          <Text style={styles.body}>
            This removes your profile, training data, check-ins, test results,
            chat history, CV, and wearable connections.
          </Text>
          <Text style={styles.body}>
            You have 30 days after requesting deletion to change your mind.
            After that your data is permanently erased from Tomo and cannot be
            recovered.
          </Text>
          <Text style={styles.bodyMuted}>
            Audit records required by law (e.g. safety incidents, AI quality
            logs) are preserved in anonymised form with no personal data
            attached.
          </Text>
          <Pressable
            style={[styles.dangerBtn, submitting && styles.btnDisabled]}
            disabled={submitting}
            onPress={onRequest}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <Text style={styles.dangerBtnText}>Delete my account</Text>
            )}
          </Pressable>
        </View>
      );
    }

    if (status.status === 'pending') {
      const days = status.daysRemaining ?? 0;
      return (
        <View style={styles.section}>
          <SmartIcon name="alarm" size={36} color={colors.error} />
          <Text style={styles.heading}>Account scheduled for deletion</Text>
          <Text style={[styles.countdown, { color: colors.error }]}>
            {days} {days === 1 ? 'day' : 'days'} until permanent deletion
          </Text>
          <Text style={styles.body}>
            Requested on{' '}
            {status.requestedAt
              ? new Date(status.requestedAt).toDateString()
              : '—'}
            . Scheduled purge{' '}
            {status.scheduledPurgeAt
              ? new Date(status.scheduledPurgeAt).toDateString()
              : '—'}
            .
          </Text>
          <Text style={styles.bodyMuted}>
            Your account is locked — writes and reads are blocked until the
            purge runs. Cancel any time before the purge to restore full
            access.
          </Text>
          {status.canCancel && (
            <Pressable
              style={[styles.primaryBtn, submitting && styles.btnDisabled]}
              disabled={submitting}
              onPress={onCancel}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <Text style={styles.primaryBtnText}>Cancel deletion</Text>
              )}
            </Pressable>
          )}
        </View>
      );
    }

    // purging / purged / failed
    return (
      <View style={styles.section}>
        <SmartIcon name="information-circle" size={36} color={colors.accent1} />
        <Text style={styles.heading}>Status: {status.status}</Text>
        <Text style={styles.body}>
          Your deletion request is in state{' '}
          <Text style={styles.code}>{status.status}</Text>. No further action
          is available from the app.
        </Text>
      </View>
    );
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <SmartIcon name="arrow-back" size={24} color={colors.textOnDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Delete account</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: colors.textOnDark,
      fontSize: 18,
      fontFamily: fontFamily.semiBold,
    },
    scroll: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    loading: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    section: {
      gap: spacing.md,
      backgroundColor: colors.cardLight,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
    },
    heading: {
      color: colors.textOnDark,
      fontSize: 20,
      fontFamily: fontFamily.semiBold,
    },
    countdown: {
      fontSize: 22,
      fontFamily: fontFamily.bold,
    },
    body: {
      color: colors.textOnDark,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamily.regular,
    },
    bodyMuted: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamily.regular,
    },
    code: {
      fontFamily: fontFamily.regular,
    },
    dangerBtn: {
      backgroundColor: colors.error,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    dangerBtnText: {
      color: colors.textOnDark,
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
    primaryBtn: {
      backgroundColor: colors.accent1,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: {
      color: colors.textOnDark,
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    errorBanner: {
      backgroundColor: colors.error,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
    },
    errorText: {
      color: colors.textOnDark,
      fontFamily: fontFamily.regular,
      fontSize: 13,
    },
  });
