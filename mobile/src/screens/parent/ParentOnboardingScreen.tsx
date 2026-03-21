/**
 * Parent Onboarding Screen
 * Simplified 2-step flow: Welcome → Enter child's email → Done
 * Replaces the full athletic onboarding for parent accounts.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { SlideInRight, SlideInLeft } from 'react-native-reanimated';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/Input';
import { linkChildByEmail, submitOnboarding } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';

type Step = 'welcome' | 'email';

export function ParentOnboardingScreen() {
  const { colors } = useTheme();
  const { refreshProfile } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  // Direction for slide animation
  const [slideDirection, setSlideDirection] = useState<'right' | 'left'>('right');

  const goToEmail = useCallback(() => {
    setSlideDirection('right');
    setStep('email');
  }, []);

  const goBackToWelcome = useCallback(() => {
    setSlideDirection('left');
    setStep('welcome');
  }, []);

  const handleSendLink = useCallback(async () => {
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await linkChildByEmail(email.trim());
      setPlayerName(result.playerName);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (message.includes('No player account')) {
        setError('No Tomo account found with that email. Ask your child to create their account first.');
      } else if (message.includes('already linked') || message.includes('already pending')) {
        setError("You're already linked with this player.");
      } else if (message.includes('not a player account')) {
        setError('That account is not a player account.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleFinish = useCallback(async () => {
    setIsFinishing(true);
    try {
      await submitOnboarding({} as any);
      await refreshProfile();
    } catch (err) {
      console.error('[ParentOnboarding] finish failed:', err);
      Alert.alert('Tomo', 'Could not complete setup. Please try again.');
    } finally {
      setIsFinishing(false);
    }
  }, [refreshProfile]);

  const handleSkip = useCallback(async () => {
    // Allow parent to skip email entry and finish onboarding
    setIsFinishing(true);
    try {
      await submitOnboarding({} as any);
      await refreshProfile();
    } catch (err) {
      console.error('[ParentOnboarding] skip failed:', err);
      Alert.alert('Tomo', 'Could not complete setup. Please try again.');
    } finally {
      setIsFinishing(false);
    }
  }, [refreshProfile]);

  const enterAnimation = slideDirection === 'right' ? SlideInRight.duration(300) : SlideInLeft.duration(300);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent1,
                width: step === 'welcome' ? '50%' : '100%',
              },
            ]}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Welcome ────────────────────── */}
          {step === 'welcome' && (
            <Animated.View entering={enterAnimation} style={styles.stepContainer}>
              <View style={[styles.iconCircle, { backgroundColor: colors.accent1 + '22' }]}>
                <Ionicons name="people-outline" size={48} color={colors.accent1} />
              </View>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Link your child's account
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Enter your child's email to see their schedule and support their training journey.
              </Text>

              <Pressable
                onPress={goToEmail}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.accent1, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: colors.textOnDark }]}>Let's Go</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── Step 2: Email Input ────────────────── */}
          {step === 'email' && !success && (
            <Animated.View entering={enterAnimation} style={styles.stepContainer}>
              {/* Back button */}
              <Pressable onPress={goBackToWelcome} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
              </Pressable>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Your child's email
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Enter the email your child uses on Tomo
              </Text>

              <Input
                placeholder="child@example.com"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (error) setError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                iconLeft="mail-outline"
                error={error || undefined}
                containerStyle={styles.inputContainer}
              />

              <Pressable
                onPress={handleSendLink}
                disabled={loading || !email.trim()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: !email.trim() ? colors.textInactive : colors.accent1,
                    opacity: pressed ? 0.85 : loading ? 0.7 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.textOnDark }]}>Send Link Request</Text>
                )}
              </Pressable>

              <Pressable onPress={handleSkip} style={styles.skipButton} disabled={isFinishing}>
                <Text style={[styles.skipText, { color: colors.textSecondary }]}>
                  Skip for now
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── Success State ──────────────────────── */}
          {step === 'email' && success && (
            <Animated.View entering={SlideInRight.duration(300)} style={styles.stepContainer}>
              <View style={[styles.iconCircle, { backgroundColor: colors.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              </View>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Request sent!
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                We've notified {playerName || 'your child'}. Once they confirm, their schedule will appear in your calendar.
              </Text>

              <Pressable
                onPress={handleFinish}
                disabled={isFinishing}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.accent1,
                    opacity: pressed ? 0.85 : isFinishing ? 0.7 : 1,
                  },
                ]}
              >
                {isFinishing ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.textOnDark }]}>Continue</Text>
                )}
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    alignSelf: 'center',
    width: '100%',
  },
  stepContainer: {
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
    padding: spacing.xs,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  inputContainer: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: fontFamily.bold,
  },
  skipButton: {
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  skipText: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
  },
});
