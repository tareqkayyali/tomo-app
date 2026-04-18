/**
 * Age Gate Screen
 *
 * The very first thing a new user sees. Collects date of birth and
 * legal acceptance before any account is created. Under-13 is a
 * dead-end — no PII is retained for rejected signups.
 *
 * On Continue:
 *   1. Compute age. If < 13, show block card and stop.
 *   2. Fetch current legal versions (privacy + terms) from the backend
 *      and the region code from the geo-region edge function.
 *   3. Persist DOB + versions + region to signupState so it survives
 *      the email-verification round-trip and OAuth redirect.
 *   4. Navigate to Signup (which will later split into the six-screen
 *      flow in Phase 2).
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Linking,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SmartIcon } from '../../components/SmartIcon';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { getLegalVersions, getLegalDocUrl } from '../../services/legalVersions';
import { getGeoRegion } from '../../services/geoRegion';
import { saveSignupState } from '../../services/signupState';
import type { AuthStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'AgeGate'>;
};

const MIN_AGE = 13;

function computeAge(dob: Date, now: Date = new Date()): number {
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
  return years;
}

function formatDob(d: Date): string {
  // YYYY-MM-DD without timezone drift.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AgeGateScreen({ navigation }: Props) {
  // Default to 15 years ago — keeps the picker in the target-audience
  // range so a teen sees a reasonable starting point.
  const defaultDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d;
  }, []);

  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const age = dob ? computeAge(dob) : null;

  const openLegal = (doc: 'privacy' | 'terms') => {
    Linking.openURL(getLegalDocUrl(doc)).catch(() => {
      // If the device can't open the URL, fail quietly — the checkbox
      // label still communicates the intent.
    });
  };

  const handleDobChange = (event: unknown, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selected) {
      setDob(selected);
      setError(null);
    }
  };

  const handleWebDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    // <input type="date"> gives YYYY-MM-DD; construct a Date at local noon
    // so timezone rollover doesn't shift the day.
    const [y, m, d] = v.split('-').map(Number);
    setDob(new Date(y, m - 1, d, 12, 0, 0));
    setError(null);
  };

  const canContinue = !!dob && acceptLegal && !blocked && !loading;

  const handleContinue = async () => {
    if (!dob) {
      setError('Please enter your date of birth.');
      return;
    }
    if (!acceptLegal) {
      setError('Please accept the Terms and Privacy Policy.');
      return;
    }
    const a = computeAge(dob);
    if (a < MIN_AGE) {
      setBlocked(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [versions, geo] = await Promise.all([
        getLegalVersions(),
        getGeoRegion(),
      ]);
      await saveSignupState({
        dateOfBirth: formatDob(dob),
        tosVersion: versions.terms,
        privacyVersion: versions.privacy,
        regionCode: geo.regionCode,
      });
      navigation.navigate('Signup');
    } catch (e) {
      setError(
        (e as Error).message ||
          "Couldn't load the legal documents. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (blocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.blockedWrap}>
          <SmartIcon name="alert-circle-outline" size={56} color={colors.accent2} />
          <Text style={styles.blockedTitle}>Tomo is for athletes 13 and up.</Text>
          <Text style={styles.blockedBody}>
            Thanks for your interest. We'll be here when you're ready — come back on
            your 13th birthday.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.blockedLink}
          >
            <Text style={styles.blockedLinkText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>When's your birthday?</Text>
            <Text style={styles.subtitle}>
              Tomo uses this to keep your training safe for your age.
            </Text>
          </View>

          {error !== null && (
            <View style={styles.errorBanner}>
              <SmartIcon name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* ── DOB input ────────────────────────────────────────── */}
          {Platform.OS === 'web' ? (
            <View style={styles.webDobWrap}>
              <Text style={styles.label}>Date of birth</Text>
              <input
                type="date"
                max={formatDob(new Date())}
                value={dob ? formatDob(dob) : ''}
                onChange={handleWebDobChange}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: colors.backgroundElevated,
                  color: colors.textOnDark,
                  borderRadius: 8,
                  border: `1px solid ${colors.borderLight}`,
                  fontFamily: fontFamily.medium,
                  fontSize: 16,
                }}
              />
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setShowPicker(true)}
                style={styles.nativeDobButton}
              >
                <Text style={styles.nativeDobLabel}>Date of birth</Text>
                <Text style={styles.nativeDobValue}>
                  {dob
                    ? dob.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : 'Tap to select'}
                </Text>
              </Pressable>
              {showPicker && (
                <DateTimePicker
                  value={dob ?? defaultDob}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDobChange}
                  maximumDate={new Date()}
                  minimumDate={new Date(1940, 0, 1)}
                  themeVariant="dark"
                />
              )}
            </>
          )}

          {age !== null && (
            <Text style={styles.ageEcho}>You'll be {age} this year.</Text>
          )}

          {/* ── Legal checkbox ──────────────────────────────────── */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setAcceptLegal((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptLegal }}
          >
            <View
              style={[
                styles.checkbox,
                acceptLegal && styles.checkboxChecked,
              ]}
            >
              {acceptLegal ? (
                <SmartIcon name="checkmark" size={14} color={colors.background} />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to Tomo's{' '}
              <Text style={styles.linkInline} onPress={() => openLegal('terms')}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text style={styles.linkInline} onPress={() => openLegal('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>

          {/* ── Continue ────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.continueBtn,
              !canContinue && styles.continueBtnDisabled,
            ]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>
              {loading ? 'Checking...' : 'Continue'}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.link}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  webDobWrap: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  nativeDobButton: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  nativeDobLabel: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginBottom: 2,
  },
  nativeDobValue: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.textOnDark,
  },
  ageEcho: {
    ...typography.bodySmall,
    color: colors.accent1,
    marginBottom: spacing.lg,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  checkboxLabel: {
    ...typography.bodySmall,
    color: colors.textOnDark,
    flex: 1,
    lineHeight: 20,
  },
  linkInline: {
    color: colors.accent1,
    fontFamily: fontFamily.semiBold,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.accent1,
    marginBottom: spacing.lg,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.background,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  footerText: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
  },
  link: {
    ...typography.bodyOnDark,
    color: colors.accent2,
    fontFamily: fontFamily.semiBold,
    marginLeft: spacing.xs,
  },

  // ── Blocked state ─────────────────────────────────────────────
  blockedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
    gap: spacing.md,
  },
  blockedTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textOnDark,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  blockedBody: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  blockedLink: {
    marginTop: spacing.lg,
  },
  blockedLinkText: {
    ...typography.bodyOnDark,
    color: colors.accent1,
    fontFamily: fontFamily.semiBold,
  },
});
