/**
 * Coach Onboarding Screen
 * Simplified 2-step flow: Welcome → Enter player email → Done
 * Supports "Add Another Player" since coaches often have multiple athletes.
 * Replaces the full athletic onboarding for coach accounts.
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
import { SmartIcon } from '../../components/SmartIcon';
import Animated, { SlideInRight, SlideInLeft } from 'react-native-reanimated';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/Input';
import { linkPlayerByEmail, submitOnboarding } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';

type Step = 'welcome' | 'email';

export function CoachOnboardingScreen() {
  const { colors } = useTheme();
  const { refreshProfile } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [linkedCount, setLinkedCount] = useState(0);

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
      const result = await linkPlayerByEmail(email.trim());
      setPlayerName(result.playerName);
      setSuccess(true);
      setLinkedCount((prev) => prev + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (message.includes('No player account')) {
        setError('No Tomo account found with that email. Ask your player to create their account first.');
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

  const handleAddAnother = useCallback(() => {
    setEmail('');
    setError('');
    setSuccess(false);
    setPlayerName('');
  }, []);

  const handleFinish = useCallback(async () => {
    setIsFinishing(true);
    try {
      await submitOnboarding({} as any);
      await refreshProfile();
    } catch (err) {
      console.error('[CoachOnboarding] finish failed:', err);
      if (Platform.OS === 'web') {
        window.alert('Could not complete setup. Please try again.');
      } else {
        Alert.alert('Tomo', 'Could not complete setup. Please try again.');
      }
    } finally {
      setIsFinishing(false);
    }
  }, [refreshProfile]);

  const handleSkip = useCallback(async () => {
    setIsFinishing(true);
    try {
      await submitOnboarding({} as any);
      await refreshProfile();
    } catch (err) {
      console.error('[CoachOnboarding] skip failed:', err);
      if (Platform.OS === 'web') {
        window.alert('Could not complete setup. Please try again.');
      } else {
        Alert.alert('Tomo', 'Could not complete setup. Please try again.');
      }
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
                <SmartIcon name="fitness-outline" size={48} color={colors.accent1} />
              </View>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Link your athletes
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Add players to your roster by entering their Tomo email. You'll be able to track their training, readiness, and test results.
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
                <SmartIcon name="arrow-back" size={24} color={colors.textOnDark} />
              </Pressable>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Player's email
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Enter the email your player uses on Tomo
              </Text>

              <Input
                placeholder="player@example.com"
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
                  {linkedCount > 0 ? 'Done adding players' : 'Skip for now'}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── Success State ──────────────────────── */}
          {step === 'email' && success && (
            <Animated.View entering={SlideInRight.duration(300)} style={styles.stepContainer}>
              <View style={[styles.iconCircle, { backgroundColor: colors.success + '22' }]}>
                <SmartIcon name="checkmark-circle" size={48} color={colors.success} />
              </View>

              <Text style={[styles.title, { color: colors.textOnDark }]}>
                Request sent!
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                We've notified {playerName || 'the player'}. Once they confirm, they'll appear in your player list.
              </Text>

              {linkedCount > 0 && (
                <Text style={[styles.linkedBadge, { color: colors.accent1 }]}>
                  {linkedCount} player{linkedCount > 1 ? 's' : ''} invited
                </Text>
              )}

              {/* Add Another Player */}
              <Pressable
                onPress={handleAddAnother}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.accent1,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: colors.textOnDark }]}>Add Another Player</Text>
              </Pressable>

              {/* Continue / Finish */}
              <Pressable
                onPress={handleFinish}
                disabled={isFinishing}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: colors.textSecondary,
                    opacity: pressed ? 0.85 : isFinishing ? 0.7 : 1,
                  },
                ]}
              >
                {isFinishing ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Text style={[styles.secondaryButtonText, { color: colors.textOnDark }]}>
                    Continue
                  </Text>
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
  secondaryButton: {
    width: '100%',
    height: 52,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: spacing.md,
  },
  secondaryButtonText: {
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
  linkedBadge: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    marginBottom: spacing.lg,
  },
});
