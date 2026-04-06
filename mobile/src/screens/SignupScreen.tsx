/**
 * Signup Screen
 * Registration for Tomo with profile setup — dark aesthetic
 * Only 4 supported sports: football, basketball, tennis, padel
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../theme';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import type { AuthStackParamList } from '../navigation/types';
import type { Sport, UserRole } from '../types';

type SignupScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
};

const ROLES: { value: UserRole; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { value: 'player', label: 'Athlete', icon: 'fitness-outline', desc: 'I train & compete' },
  { value: 'coach', label: 'Coach', icon: 'people-outline', desc: 'I coach athletes' },
  { value: 'parent', label: 'Parent', icon: 'heart-outline', desc: 'I support my child' },
];

const SPORTS: { value: Sport; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'football', label: 'Football', icon: 'football-outline' },
  { value: 'basketball', label: 'Basketball', icon: 'basketball-outline' },
  { value: 'tennis', label: 'Tennis', icon: 'tennisball-outline' },
  { value: 'padel', label: 'Padel', icon: 'tennisball-outline' },
];

export function SignupScreen({ navigation }: SignupScreenProps) {
  const { register, socialLogin, completeRegistration, isLoading, isAuthenticated, needsRegistration } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1: Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Profile
  const [selectedRole, setSelectedRole] = useState<UserRole>('player');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sport, setSport] = useState<Sport | ''>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signupError, setSignupError] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  // Track whether user signed up via OAuth (skip email/password step)
  const [isOAuthSignup, setIsOAuthSignup] = useState(false);

  // Auto-detect OAuth user arriving from LoginScreen (already authenticated, needs profile)
  // Pre-fill name from Google/Apple user metadata
  useEffect(() => {
    if (isAuthenticated && needsRegistration) {
      setIsOAuthSignup(true);
      setStep(2);

      // Pre-fill name from OAuth provider metadata
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.user_metadata) {
          const meta = session.user.user_metadata;
          // Google provides full_name or name; Apple provides first/last name
          const oauthName =
            meta.full_name ||
            meta.name ||
            (meta.given_name && meta.family_name
              ? `${meta.given_name} ${meta.family_name}`
              : meta.given_name || '');
          if (oauthName && !name) {
            setName(oauthName);
          }
        }
      });
    }
  }, [isAuthenticated, needsRegistration]);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = 'Name is required';
    // Age and sport only required for players
    if (selectedRole === 'player') {
      if (!age) newErrors.age = 'Age is required';
      else {
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 8 || ageNum > 25) {
          newErrors.age = 'Age must be between 8 and 25';
        }
      }
      if (!sport) newErrors.sport = 'Please select a sport';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSocialAuth = async (provider: 'apple' | 'google') => {
    setSignupError('');
    setSocialLoading(provider);
    try {
      await socialLogin(provider);
      // If socialLogin succeeds and needsRegistration is true,
      // the user will be kept on this screen — jump to step 2 for profile info
      setIsOAuthSignup(true);
      setStep(2);
    } catch (error) {
      const msg = (error as Error).message;
      if (!msg.includes('cancelled')) {
        setSignupError(msg);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
      setErrors({});
    }
  };

  const handleSignup = async () => {
    if (!validateStep2()) return;
    setSignupError('');
    try {
      const profileData: Record<string, unknown> = {
        name,
        role: selectedRole,
      };
      // Only include age/sport for players
      if (selectedRole === 'player') {
        profileData.age = parseInt(age, 10);
        profileData.sport = sport as Sport;
      }
      if (isOAuthSignup) {
        await completeRegistration(profileData as any);
      } else {
        await register(email, password, profileData as any);
      }
    } catch (error) {
      setSignupError((error as Error).message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ─── Header ──────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              {step === 1 ? 'Step 1: Account Details' : 'Step 2: About You'}
            </Text>
          </View>

          {/* ─── Progress Indicator ──────────────────────────────── */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
            <View style={[styles.progressLine, step >= 2 && styles.progressLineActive]} />
            <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
          </View>

          {signupError !== '' && (
            <View style={styles.errorBanner}>
              <SmartIcon name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorBannerText}>{signupError}</Text>
            </View>
          )}

          {step === 1 ? (
            <View style={styles.form}>
              {/* Social Auth Buttons */}
              <View style={styles.socialSection}>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('apple')}
                  activeOpacity={0.8}
                >
                  <SmartIcon name="logo-apple" size={20} color={colors.background} />
                  <Text style={styles.socialButtonText}>Continue with Apple</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('google')}
                  activeOpacity={0.8}
                >
                  <SmartIcon name="logo-google" size={18} color={colors.background} />
                  <Text style={styles.socialButtonText}>Continue with Google</Text>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or sign up with email</Text>
                <View style={styles.dividerLine} />
              </View>

              <Input
                label="Email"
                placeholder="your@email.com"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Input
                label="Password"
                placeholder="Create a password"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                secureTextEntry
              />

              <Input
                label="Confirm Password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={errors.confirmPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={styles.subtleBtn}
                onPress={handleNext}
                activeOpacity={0.7}
              >
                <Text style={styles.subtleBtnText}>Next</Text>
                <SmartIcon name="arrow-forward" size={16} color={colors.accent1} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              {/* ─── Role Selector ─────────────────────────────────── */}
              <Text style={styles.sportLabel}>I am a…</Text>
              <View style={styles.roleGrid}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => setSelectedRole(r.value)}
                    style={[
                      styles.roleChip,
                      selectedRole === r.value && styles.roleChipSelected,
                    ]}
                  >
                    <SmartIcon
                      name={r.icon}
                      size={22}
                      color={selectedRole === r.value ? colors.accent1 : colors.textInactive}
                    />
                    <Text
                      style={[
                        styles.roleChipLabel,
                        selectedRole === r.value && styles.roleChipLabelSelected,
                      ]}
                    >
                      {r.label}
                    </Text>
                    <Text
                      style={[
                        styles.roleChipDesc,
                        selectedRole === r.value && styles.roleChipDescSelected,
                      ]}
                    >
                      {r.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                error={errors.name}
                autoCapitalize="words"
              />

              {/* Age & Sport only for players */}
              {selectedRole === 'player' && (
                <>
                  <Input
                    label="Age"
                    placeholder="Your age"
                    value={age}
                    onChangeText={setAge}
                    error={errors.age}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.sportLabel}>Sport</Text>
                  {errors.sport && <Text style={styles.error}>{errors.sport}</Text>}
                  <View style={styles.sportGrid}>
                    {SPORTS.map((s) => (
                      <TouchableOpacity
                        key={s.value}
                        onPress={() => setSport(s.value)}
                        style={[
                          styles.sportChip,
                          sport === s.value && styles.sportChipSelected,
                        ]}
                      >
                        <SmartIcon
                          name={s.icon}
                          size={18}
                          color={sport === s.value ? colors.accent1 : colors.textInactive}
                          style={styles.sportIcon}
                        />
                        <Text
                          style={[
                            styles.sportChipText,
                            sport === s.value && styles.sportChipTextSelected,
                          ]}
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.subtleBtn, styles.backButton, { backgroundColor: colors.creamSubtle, borderColor: colors.textDisabled }]}
                  onPress={() => setStep(1)}
                  activeOpacity={0.7}
                >
                  <SmartIcon name="arrow-back" size={16} color={colors.textInactive} />
                  <Text style={[styles.subtleBtnText, { color: colors.textInactive }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subtleBtn, styles.submitButton, { backgroundColor: `${colors.accent2}1F`, borderColor: `${colors.accent2}4D` }]}
                  onPress={handleSignup}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <SmartIcon name="person-add-outline" size={16} color={colors.accent2} />
                  <Text style={[styles.subtleBtnText, { color: colors.accent2 }]}>
                    {isLoading ? 'Creating...' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ─── Footer ──────────────────────────────────────────── */}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
  },
  subtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    marginTop: spacing.xs,
  },

  // ── Progress ──────────────────────────────────────────────────────
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.borderLight,
  },
  progressDotActive: {
    backgroundColor: colors.accent1,
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.xs,
  },
  progressLineActive: {
    backgroundColor: colors.accent1,
  },

  // ── Error Banner ──────────────────────────────────────────────────
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

  // ── Social Auth ──────────────────────────────────────────────────
  socialSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,243,237,0.07)',
    borderWidth: 1,
    borderColor: colors.creamSoft,
    borderRadius: 12,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  socialButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textOnDark,
  },

  // ── Divider ────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginHorizontal: spacing.md,
  },

  // ── Form ──────────────────────────────────────────────────────────
  form: {
    marginBottom: spacing.xl,
  },
  button: {
    marginTop: spacing.md,
  },
  subtleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: spacing.md,
    backgroundColor: `${colors.accent1}1F`,
    borderWidth: 1,
    borderColor: `${colors.accent1}4D`,
  },
  subtleBtnText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.accent1,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  backButton: {
    flex: 1,
    marginRight: spacing.sm,
    marginTop: spacing.md,
  },
  submitButton: {
    flex: 2,
    marginTop: spacing.md,
  },

  // ── Role Selection ──────────────────────────────────────────────
  roleGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  roleChipSelected: {
    backgroundColor: `${colors.accent1}1F`,
    borderColor: `${colors.accent1}4D`,
  },
  roleChipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textInactive,
    marginTop: spacing.xs,
  },
  roleChipLabelSelected: {
    color: colors.accent1,
  },
  roleChipDesc: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginTop: 2,
    textAlign: 'center',
  },
  roleChipDescSelected: {
    color: `${colors.accent1}B3`,
  },

  // ── Sport Selection ───────────────────────────────────────────────
  sportLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  sportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sportChipSelected: {
    backgroundColor: `${colors.accent1}1F`,
    borderColor: `${colors.accent1}4D`,
  },
  sportIcon: {
    marginRight: spacing.xs,
  },
  sportChipText: {
    ...typography.caption,
    color: colors.textInactive,
    fontFamily: fontFamily.medium,
  },
  sportChipTextSelected: {
    color: colors.accent1,
  },

  // ── Footer ────────────────────────────────────────────────────────
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
});
