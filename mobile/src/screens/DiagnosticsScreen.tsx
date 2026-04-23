/**
 * Diagnostics Screen (hidden)
 * Shows API config, health ping, and Supabase token state.
 * Accessible from Profile > tap version text 5 times.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SmartIcon } from '../components/SmartIcon';
import { Loader } from '../components/Loader';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { colors, spacing, fontFamily, layout, borderRadius, screenBg } from '../theme';
import { API_BASE_URL, healthCheck } from '../services/api';
import { getIdToken, getCurrentUser } from '../services/auth';

export function DiagnosticsScreen() {
  const navigation = useNavigation<any>();
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const pingHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthStatus(null);
    const start = Date.now();
    try {
      const result = await healthCheck();
      const ms = Date.now() - start;
      setHealthStatus(`OK (${ms}ms) — ${result.status}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setHealthStatus(`FAIL — ${msg}`);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const checkToken = useCallback(async () => {
    setTokenLoading(true);
    setTokenStatus(null);
    try {
      const user = getCurrentUser();
      if (!user) {
        setTokenStatus('No user signed in');
        return;
      }
      const token = await getIdToken();
      if (token) {
        setTokenStatus(`Valid — uid: ${user.uid.slice(0, 8)}... token: ${token.slice(0, 20)}...`);
      } else {
        setTokenStatus('User signed in but token is null');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setTokenStatus(`ERROR — ${msg}`);
    } finally {
      setTokenLoading(false);
    }
  }, []);

  return (
    <PlayerScreen
      label="SYSTEM"
      title="Diagnostics"
      onBack={() => navigation.goBack()}
      contentStyle={styles.content}
    >
        {/* API Base URL */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>API Base URL</Text>
          <Text style={styles.mono}>{API_BASE_URL}</Text>
          <Text style={styles.hint}>
            {__DEV__ ? 'Development mode' : 'Production mode'}
          </Text>
        </View>

        {/* Health Check */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Health Check</Text>
          <Pressable style={styles.button} onPress={pingHealth} disabled={healthLoading}>
            {healthLoading ? (
              <Loader size="sm" />
            ) : (
              <>
                <SmartIcon name="pulse-outline" size={18} color={colors.accent1} />
                <Text style={styles.buttonText}>Ping /health</Text>
              </>
            )}
          </Pressable>
          {healthStatus && (
            <Text style={[
              styles.result,
              healthStatus.startsWith('OK') ? styles.resultOk : styles.resultFail,
            ]}>
              {healthStatus}
            </Text>
          )}
        </View>

        {/* Supabase Token */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Supabase Auth Token</Text>
          <Pressable style={styles.button} onPress={checkToken} disabled={tokenLoading}>
            {tokenLoading ? (
              <Loader size="sm" />
            ) : (
              <>
                <SmartIcon name="key-outline" size={18} color={colors.accent1} />
                <Text style={styles.buttonText}>Check Token</Text>
              </>
            )}
          </Pressable>
          {tokenStatus && (
            <Text style={[
              styles.result,
              tokenStatus.startsWith('Valid') ? styles.resultOk : styles.resultFail,
            ]}>
              {tokenStatus}
            </Text>
          )}
        </View>
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: screenBg },
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textHeader,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textOnLight,
    marginBottom: spacing.sm,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors.accent1,
    marginBottom: spacing.xs,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  buttonText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.accent1,
  },
  result: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  resultOk: {
    color: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  resultFail: {
    color: colors.error,
    backgroundColor: colors.secondarySubtle,
  },
});

