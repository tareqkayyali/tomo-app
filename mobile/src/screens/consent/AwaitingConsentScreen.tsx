/**
 * Awaiting Consent Screen
 *
 * Sandbox shown to EU/UK 13-15 minors who completed signup but whose
 * parent hasn't consented yet. Migration 062 blocks writes to
 * chat_messages, checkins, health_data, sleep_logs, video_test_results
 * for users in this state; we back that up with UX that shows only
 * the path forward: generate a code, share it with a parent, wait.
 *
 * On mount we generate (or cache) a 6-char code via
 * /relationships/invite-parent. "I'm done — check now" refreshes the
 * user profile; when consent_status flips to 'active', RootNavigator
 * auto-routes to the main app.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SmartIcon } from '../../components/SmartIcon';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { generateParentInviteCode } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

export function AwaitingConsentScreen() {
  const { profile, refreshProfile, logout } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate (or fetch) the code on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await generateParentInviteCode();
        if (cancelled) return;
        setCode(res.code);
        setExpiresAt(res.expiresAt);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckAgain = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  };

  const handleShare = async () => {
    if (!code) return;
    const msg =
      `Hi — I just signed up for Tomo (sport coaching app for young athletes). ` +
      `To finish setup, download Tomo, pick "Parent" at signup, and enter this code: ${code}.`;
    try {
      if (Platform.OS === 'web') {
        if (
          typeof navigator !== 'undefined' &&
          typeof (navigator as Navigator & { share?: unknown }).share === 'function'
        ) {
          await (navigator as Navigator & {
            share: (d: { text?: string; title?: string }) => Promise<void>;
          }).share({
            title: 'Tomo parent code',
            text: msg,
          });
        } else {
          await Clipboard.setStringAsync(msg);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        await Share.share({ message: msg });
      }
    } catch {
      // User cancelled share — no-op.
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PlayerScreen label="CONSENT" title="Awaiting consent" contentStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <SmartIcon name="shield-checkmark-outline" size={48} color={colors.accent1} />
        </View>

        <Text style={styles.title}>One last step</Text>
        <Text style={styles.subtitle}>
          {profile?.name ? `Hey ${profile.name}, ` : ''}
          Tomo needs a parent or guardian to say yes before you can start training.
        </Text>

        {error && (
          <View style={styles.errorBanner}>
            <SmartIcon name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Code card ────────────────────────────────── */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your parent code</Text>
          {loading ? (
            <Text style={styles.codeLoading}>Generating...</Text>
          ) : (
            <TouchableOpacity onPress={handleCopyCode} activeOpacity={0.7}>
              <Text style={styles.code}>{code ?? '——————'}</Text>
              <Text style={styles.codeTap}>{copied ? 'Copied!' : 'Tap to copy'}</Text>
            </TouchableOpacity>
          )}
          {expiresAt && (
            <Text style={styles.codeExpiry}>
              Expires {new Date(expiresAt).toLocaleDateString('en-GB')}
            </Text>
          )}
        </View>

        {/* ── Instructions ────────────────────────────── */}
        <View style={styles.steps}>
          <Step num={1} text='Ask your parent to download Tomo and sign up as "Parent".' />
          <Step num={2} text='On their first screen they tap "Enter child code".' />
          <Step num={3} text={`They enter ${code ?? 'your code'} and confirm.`} />
          <Step num={4} text="Come back here and tap 'Check now'." />
        </View>

        <TouchableOpacity
          onPress={handleShare}
          disabled={!code}
          style={[styles.secondaryBtn, !code && styles.btnDisabled]}
          activeOpacity={0.8}
        >
          <SmartIcon name="share-outline" size={16} color={colors.accent1} />
          <Text style={styles.secondaryBtnText}>Share code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleCheckAgain}
          disabled={refreshing}
          style={[styles.primaryBtn, refreshing && styles.btnDisabled]}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>
            {refreshing ? 'Checking...' : 'Check now'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={logout} style={styles.logoutLink} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
    </PlayerScreen>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.num}>
        <Text style={stepStyles.numText}>{num}</Text>
      </View>
      <Text style={stepStyles.text}>{text}</Text>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  num: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${colors.accent1}26`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.accent1,
  },
  text: {
    flex: 1,
    ...typography.bodyOnDark,
    color: colors.textOnDark,
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  codeCard: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: `${colors.accent1}4D`,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  codeLabel: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  codeLoading: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    color: colors.textInactive,
  },
  code: {
    fontFamily: fontFamily.bold,
    fontSize: 44,
    letterSpacing: 6,
    color: colors.accent1,
    textAlign: 'center',
  },
  codeTap: {
    ...typography.bodySmall,
    color: colors.textInactive,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  codeExpiry: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginTop: spacing.md,
  },
  steps: {
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent1,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.background,
  },
  secondaryBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.accent1}4D`,
    marginBottom: spacing.md,
  },
  secondaryBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.accent1,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  logoutLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  logoutText: {
    ...typography.bodySmall,
    color: colors.textInactive,
  },
});
