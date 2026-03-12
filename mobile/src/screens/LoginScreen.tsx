/**
 * Login / Welcome Screen — Gen Z UX
 *
 * Design principles:
 *  - Hero brand moment: full-screen dark bg with signature gradient accents
 *  - Social-first: Apple + Google CTAs above email form
 *  - Zero friction: email form collapsed by default, expand on tap
 *  - Bold typography, tight spacing, instant-value messaging
 *  - Sign Up = "Get Started" pill, Sign In = secondary
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
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Input } from '../components';
import {
  colors,
  spacing,
  borderRadius,
  fontFamily,
  layout,
} from '../theme';
import { useAuth } from '../hooks/useAuth';
import type { AuthStackParamList } from '../navigation/types';

// Brand logo
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brandLogo = require('../../assets/tomo-logo.png');

const { width: SCREEN_W } = Dimensions.get('window');

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { login, socialLogin, isLoading, needsRegistration } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loginError, setLoginError] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  // If OAuth user needs registration (no backend profile), redirect to Signup step 2
  useEffect(() => {
    if (needsRegistration) {
      navigation.navigate('Signup');
    }
  }, [needsRegistration]);

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoginError('');
    try {
      await login(email, password);
    } catch (error) {
      setLoginError((error as Error).message);
    }
  };

  const handleSocialAuth = async (provider: 'apple' | 'google') => {
    setLoginError('');
    setSocialLoading(provider);
    try {
      await socialLogin(provider);
    } catch (error) {
      const msg = (error as Error).message;
      if (!msg.includes('cancelled')) {
        setLoginError(msg);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ─── Hero Brand Section ─────────────────────────────── */}
          <View style={styles.heroSection}>
            {/* Gradient glow behind logo */}
            <View style={styles.glowContainer}>
              <LinearGradient
                colors={['rgba(255, 107, 53, 0.20)', 'rgba(0, 217, 255, 0.15)', 'transparent']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.glowGradient}
              />
            </View>

            <Image
              source={brandLogo}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>YOUR AI COACH</Text>

            {/* Value props */}
            <View style={styles.valueProps}>
              <View style={styles.valuePill}>
                <Ionicons name="flash" size={14} color={colors.accent1} />
                <Text style={styles.valuePillText}>Smart Training</Text>
              </View>
              <View style={styles.valuePill}>
                <Ionicons name="trending-up" size={14} color={colors.accent2} />
                <Text style={styles.valuePillText}>Track Progress</Text>
              </View>
              <View style={styles.valuePill}>
                <Ionicons name="body" size={14} color={colors.readinessGreen} />
                <Text style={styles.valuePillText}>Recovery</Text>
              </View>
            </View>
          </View>

          {/* ─── Auth Section ───────────────────────────────────── */}
          <View style={styles.authSection}>
            {/* Primary CTA: Get Started (→ Signup) */}
            <TouchableOpacity
              style={styles.getStartedBtn}
              onPress={() => navigation.navigate('Signup')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={colors.gradientOrangeCyan}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.getStartedGradient}
              >
                <Text style={styles.getStartedText}>Get Started</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>already have an account?</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Sign In */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => handleSocialAuth('apple')}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                <Text style={styles.socialBtnText}>Apple</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => handleSocialAuth('google')}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                <Text style={styles.socialBtnText}>Google</Text>
              </TouchableOpacity>
            </View>

            {/* Email Sign In — collapsed by default */}
            {!showEmailForm ? (
              <TouchableOpacity
                style={styles.emailToggle}
                onPress={() => setShowEmailForm(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="mail-outline" size={16} color={colors.textInactive} />
                <Text style={styles.emailToggleText}>Sign in with email</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.emailForm}>
                {loginError !== '' && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorBannerText}>{loginError}</Text>
                  </View>
                )}

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
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
                  secureTextEntry
                />

                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword')}
                  style={styles.forgotRow}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                <Button
                  title="Sign In"
                  onPress={handleLogin}
                  loading={isLoading}
                  variant="primary"
                  size="large"
                  style={styles.signInBtn}
                />
              </View>
            )}
          </View>

          {/* ─── Footer ─────────────────────────────────────────── */}
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms & Privacy Policy
          </Text>
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
    justifyContent: 'center',
  },

  // ── Hero Brand ──────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: -SCREEN_W * 0.2,
    right: -SCREEN_W * 0.2,
    height: 280,
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
    borderRadius: 200,
  },
  brandLogo: {
    width: 140,
    height: 140,
    marginBottom: 4,
  },
  tagline: {
    fontFamily: fontFamily.light,
    fontSize: 11,
    letterSpacing: 5,
    color: colors.textInactive,
    textTransform: 'uppercase',
    marginBottom: spacing.lg,
  },

  // ── Value Props ──────────────────────────────────────────────────
  valueProps: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  valuePillText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textInactive,
  },

  // ── Auth Section ────────────────────────────────────────────────
  authSection: {
    paddingVertical: spacing.lg,
  },

  // Get Started button
  getStartedBtn: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  getStartedGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: spacing.sm,
  },
  getStartedText: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: '#FFFFFF',
  },

  // Divider
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
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    marginHorizontal: spacing.md,
  },

  // Social buttons — side by side
  socialRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  socialBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textOnDark,
  },

  // Email toggle link
  emailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  emailToggleText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
  },

  // Email form (expanded)
  emailForm: {
    marginTop: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  errorBannerText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
    flex: 1,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  forgotText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent2,
  },
  signInBtn: {
    marginTop: spacing.sm,
  },

  // ── Footer ──────────────────────────────────────────────────────
  footerText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
});
