/**
 * Login / Welcome Screen — Gen Z UX
 *
 * Design principles:
 *  - Pure black background, no glow/blob effects
 *  - Text-based logo (no image with baked-in gradients)
 *  - Social-first: Apple + Google CTAs above email form
 *  - Email form visible by default
 *  - Tight, symmetrical spacing (16px gap between all sections)
 *  - Fully scrollable on small screens with proper bottom padding
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components';
import {
  colors,
  spacing,
  borderRadius,
  fontFamily,
  layout,
} from '../theme';
import { useAuth } from '../hooks/useAuth';
import type { AuthStackParamList } from '../navigation/types';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { login, socialLogin, isLoading, needsRegistration } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(true);
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
    if (!validate()) {
      return;
    }
    setLoginError('');
    try {
      await login(email, password);
    } catch (error) {
      const msg = (error as Error).message;
      console.error('[LoginScreen] login error:', msg);
      setLoginError(msg);
      if (Platform.OS === 'web') {
        window.alert('Login failed: ' + msg);
      } else {
        Alert.alert('Tomo', 'Login failed: ' + msg);
      }
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
            {/* Wifi icon */}
            <View style={styles.wifiIcon}>
              <Ionicons name="wifi" size={28} color={colors.accent1} />
            </View>

            {/* Brand name */}
            <Text style={styles.brandName}>tomo</Text>
            <Text style={styles.tagline}>YOUR AI COACH</Text>

            {/* Value props */}
            <View style={styles.valueProps}>
              <View style={styles.valuePill}>
                <Ionicons name="flash" size={12} color={colors.accent1} />
                <Text style={styles.valuePillText}>Smart Training</Text>
              </View>
              <View style={styles.valuePill}>
                <Ionicons name="trending-up" size={12} color={colors.accent2} />
                <Text style={styles.valuePillText}>Track Progress</Text>
              </View>
              <View style={styles.valuePill}>
                <Ionicons name="body" size={12} color={colors.readinessGreen} />
                <Text style={styles.valuePillText}>Recovery</Text>
              </View>
            </View>
          </View>

          {/* ─── Auth Section ───────────────────────────────────── */}
          <View style={styles.authSection}>
            {/* Social Sign In — primary options */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => handleSocialAuth('apple')}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
                <Text style={styles.socialBtnText}>Apple</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => handleSocialAuth('google')}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                <Text style={styles.socialBtnText}>Google</Text>
              </TouchableOpacity>
            </View>

            {/* Email Sign In */}
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

                <TouchableOpacity
                  style={[styles.signInBtn, { backgroundColor: `${colors.accent1}1F`, borderWidth: 1, borderColor: `${colors.accent1}4D` }]}
                  onPress={handleLogin}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <Ionicons name="log-in-outline" size={16} color={colors.accent1} />
                  <Text style={[styles.signInBtnText, { color: colors.accent1 }]}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>new to tomo?</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign Up CTA */}
            <TouchableOpacity
              style={styles.getStartedBtn}
              onPress={() => navigation.navigate('Signup')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.accent2} />
              <Text style={styles.getStartedText}>Create Account</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.accent2} />
            </TouchableOpacity>
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

/* ─── Consistent spacing: 16px between all major sections ───────── */
const GAP = spacing.md; // 16px

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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },

  // ── Hero Brand ──────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    marginBottom: GAP,
  },
  wifiIcon: {
    marginBottom: 4,
  },
  brandName: {
    fontFamily: fontFamily.light,
    fontSize: 48,
    color: colors.textPrimary,
    letterSpacing: 2,
    marginBottom: 2,
  },
  tagline: {
    fontFamily: fontFamily.light,
    fontSize: 10,
    letterSpacing: 4,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: GAP,
  },

  // ── Value Props ──────────────────────────────────────────────────
  valueProps: {
    flexDirection: 'row',
    gap: 6,
  },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  valuePillText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },

  // ── Auth Section ────────────────────────────────────────────────
  authSection: {
    marginTop: spacing.xs,
  },

  // Social buttons — side by side
  socialRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: GAP,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: borderRadius.md,
    paddingVertical: 13,
    gap: spacing.sm,
  },
  socialBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
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
    color: 'rgba(255,255,255,0.45)',
  },

  // Email form (expanded)
  emailForm: {
    marginBottom: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.12)',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: spacing.sm,
  },
  signInBtnText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: GAP,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginHorizontal: spacing.md,
  },

  // Get Started / Create Account button
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 217, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.30)',
  },
  getStartedText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent2,
  },

  // ── Footer ──────────────────────────────────────────────────────
  footerText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginTop: 'auto' as any,
    paddingTop: GAP,
    paddingBottom: spacing.lg,
  },
});
