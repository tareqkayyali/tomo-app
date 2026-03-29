/**
 * Check-in Screen — Gen Z emoji-driven wellness wizard
 *
 * 7 steps, one question at a time. Tap an emoji → auto-advance.
 * Stories-style dot progress. Glass card aesthetic.
 * Haptic feedback on every interaction.
 *
 * SAFETY: Pain flag always triggers REST recommendation.
 * "This is not medical advice" disclaimer on pain step.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { emitRefresh } from '../utils/refreshBus';
import { spacing, borderRadius, shadows, fontFamily } from '../theme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import { submitCheckin } from '../services/api';
import { getReadinessScore } from '../services/readinessScore';
import { track } from '../services/analytics';
import { useAuth } from '../hooks/useAuth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { CheckinResponse } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckinScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Checkin'>;
};

export interface CheckinStep {
  key: string;
  label: string;
  sublabel: string;
  type: 'slider' | 'sleep' | 'pain';
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  skippable: boolean;
}

// ---------------------------------------------------------------------------
// Emoji option config
// ---------------------------------------------------------------------------

interface EmojiOption {
  emoji: string;
  label: string;
  value: number;
}

const STEP_EMOJIS: Record<string, EmojiOption[]> = {
  mood: [
    { emoji: '\uD83D\uDE29', label: 'Rough', value: 2 },
    { emoji: '\uD83D\uDE15', label: 'Meh', value: 4 },
    { emoji: '\uD83D\uDE10', label: 'Okay', value: 6 },
    { emoji: '\uD83D\uDE42', label: 'Good', value: 8 },
    { emoji: '\uD83D\uDE04', label: 'Great', value: 10 },
  ],
  sleepHours: [
    { emoji: '\uD83D\uDE34', label: '<5h', value: 4 },
    { emoji: '\uD83D\uDE2A', label: '5-6h', value: 5.5 },
    { emoji: '\uD83D\uDE0A', label: '7h', value: 7 },
    { emoji: '\uD83D\uDE0E', label: '8h', value: 8 },
    { emoji: '\uD83E\uDD29', label: '9h+', value: 9.5 },
  ],
  energy: [
    { emoji: '\uD83E\uDEAB', label: 'Dead', value: 2 },
    { emoji: '\uD83D\uDE2E\u200D\uD83D\uDCA8', label: 'Low', value: 4 },
    { emoji: '\uD83D\uDE10', label: 'Okay', value: 6 },
    { emoji: '\u26A1', label: 'Wired', value: 8 },
    { emoji: '\uD83D\uDD25', label: 'On Fire', value: 10 },
  ],
  soreness: [
    { emoji: '\uD83D\uDCAA', label: 'Fresh', value: 2 },
    { emoji: '\uD83D\uDC4D', label: 'Slight', value: 4 },
    { emoji: '\uD83D\uDE10', label: 'Some', value: 6 },
    { emoji: '\uD83D\uDE23', label: 'Sore', value: 8 },
    { emoji: '\uD83E\uDD15', label: 'Wrecked', value: 10 },
  ],
  academicStress: [
    { emoji: '\uD83D\uDE0E', label: 'Chill', value: 2 },
    { emoji: '\uD83D\uDCDA', label: 'Some', value: 4 },
    { emoji: '\uD83D\uDE30', label: 'Busy', value: 6 },
    { emoji: '\uD83E\uDD2F', label: 'Hectic', value: 8 },
    { emoji: '\uD83D\uDC80', label: 'Maxed', value: 10 },
  ],
  effortYesterday: [
    { emoji: '\uD83D\uDECB\uFE0F', label: 'Rest', value: 2 },
    { emoji: '\uD83D\uDEB6', label: 'Light', value: 4 },
    { emoji: '\uD83C\uDFC3', label: 'Medium', value: 6 },
    { emoji: '\uD83D\uDCAA', label: 'Hard', value: 8 },
    { emoji: '\uD83E\uDD75', label: 'Brutal', value: 10 },
  ],
};

// ---------------------------------------------------------------------------
// Step configuration (pure, exported for testing)
// ---------------------------------------------------------------------------

export const CHECKIN_STEPS: CheckinStep[] = [
  {
    key: 'mood',
    label: 'How you feeling?',
    sublabel: 'Overall vibe right now',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low',
    highLabel: 'Great',
    skippable: true,
  },
  {
    key: 'sleepHours',
    label: "How'd you sleep?",
    sublabel: 'Hours of sleep last night',
    type: 'sleep',
    min: 4,
    max: 12,
    skippable: true,
  },
  {
    key: 'energy',
    label: 'Energy level?',
    sublabel: 'How charged up are you',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low energy',
    highLabel: 'High energy',
    skippable: true,
  },
  {
    key: 'soreness',
    label: 'Body soreness?',
    sublabel: 'How your muscles feeling',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'None',
    highLabel: 'Very sore',
    skippable: true,
  },
  {
    key: 'academicStress',
    label: 'Academic load?',
    sublabel: 'Exams, homework, study stress',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'None',
    highLabel: 'Very high',
    skippable: true,
  },
  {
    key: 'effortYesterday',
    label: "Yesterday's training?",
    sublabel: 'How hard was your last session',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Easy / Rest',
    highLabel: 'Very hard',
    skippable: true,
  },
  {
    key: 'painFlag',
    label: 'Any pain or injury?',
    sublabel: 'Be honest — your safety matters most',
    type: 'pain',
    skippable: false,
  },
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function getProgressPercent(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 1) return stepIndex >= 1 ? 1 : 0;
  return Math.max(0, Math.min(1, stepIndex / (totalSteps - 1)));
}

export function getDefaultValue(key: string): number {
  switch (key) {
    case 'sleepHours': return 7;
    case 'mood':
    case 'energy':
    case 'soreness':
    case 'effortYesterday':
    case 'academicStress': return 5;
    default: return 5;
  }
}

export function getValueDisplay(key: string, value: number): string {
  if (key === 'sleepHours') return `${value}h`;
  return `${value}/10`;
}

export function buildCheckinPayload(
  answers: Record<string, number>,
  painFlag: boolean,
  painLocation: string,
): {
  energy: number;
  soreness: number;
  sleepHours: number;
  painFlag: boolean;
  painLocation?: string;
  effortYesterday: number;
  mood: number;
  academicStress?: number;
} {
  return {
    energy: answers.energy ?? 5,
    soreness: answers.soreness ?? 5,
    sleepHours: answers.sleepHours ?? 7,
    painFlag,
    ...(painFlag && painLocation.trim() ? { painLocation: painLocation.trim() } : {}),
    effortYesterday: answers.effortYesterday ?? 5,
    mood: answers.mood ?? 5,
    ...(answers.academicStress !== undefined ? { academicStress: answers.academicStress } : {}),
  };
}

export function getCompletionMessage(archetype: string | null | undefined): string {
  const key = (archetype ?? '').toLowerCase();
  switch (key) {
    case 'phoenix': return 'Rising strong. Your plan is ready.';
    case 'titan': return 'Steady and prepared. Your plan is ready.';
    case 'blade': return 'Sharp focus. Your plan is ready.';
    case 'surge': return 'Energy locked in. Your plan is ready.';
    default: return 'All set. Your plan is ready.';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckinScreen({ navigation }: CheckinScreenProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const archetype = profile?.archetype ?? null;
  const accentColor = getArchetypeProfile(archetype).color;

  // Step state
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {};
    for (const step of CHECKIN_STEPS) {
      if (step.type !== 'pain' && step.key !== 'academicStress') {
        defaults[step.key] = getDefaultValue(step.key);
      }
    }
    return defaults;
  });
  const [selectedEmojis, setSelectedEmojis] = useState<Record<string, number>>({});
  const [painFlag, setPainFlag] = useState(false);
  const [painLocation, setPainLocation] = useState('');

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [milestoneReward, setMilestoneReward] = useState<string | null>(null);
  const [newArchetype, setNewArchetype] = useState<string | null>(null);
  const confettiRef = useRef<ConfettiCannon | null>(null);

  // Animated checkmark
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpacity.value,
  }));

  const currentStep = CHECKIN_STEPS[stepIndex];
  const isLastStep = stepIndex === CHECKIN_STEPS.length - 1;
  const totalSteps = CHECKIN_STEPS.length;

  const goNext = useCallback(() => {
    if (isLastStep) return;
    setStepIndex((i) => i + 1);
  }, [isLastStep]);

  const goBack = useCallback(() => {
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    setStepIndex((i) => i - 1);
  }, [stepIndex, navigation]);

  const handleEmojiSelect = useCallback((key: string, value: number, emojiIdx: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setSelectedEmojis((prev) => ({ ...prev, [key]: emojiIdx }));
    // Auto-advance after a brief moment
    setTimeout(() => {
      setStepIndex((i) => {
        if (i >= CHECKIN_STEPS.length - 1) return i;
        return i + 1;
      });
    }, 400);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSubmitting(true);
    setErrorMessage('');
    const payload = buildCheckinPayload(answers, painFlag, painLocation);

    try {
      const response: CheckinResponse = await submitCheckin(payload);
      setIsComplete(true);
      track('checkin_complete', { readiness: response.plan?.readinessLevel, sport: profile?.sport });
      emitRefresh('readiness');
      emitRefresh('recommendations');

      const newlyUnlocked = response.gamification?.milestones?.newlyUnlocked;
      if (newlyUnlocked && newlyUnlocked.length > 0) {
        track('streak_milestone', { milestone: newlyUnlocked[0].id, streak: response.gamification?.streak?.currentStreak });
        setMilestoneReward(newlyUnlocked[0].reward);
        setShowConfetti(true);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }

      const archetypeData = response.gamification?.archetype;
      if (archetypeData?.newlyAssigned && archetypeData.archetype) {
        setNewArchetype(archetypeData.archetype);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      checkOpacity.value = withTiming(1, { duration: 200 });
      checkScale.value = withSequence(
        withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(2)) }),
        withDelay(100, withTiming(1, { duration: 200 })),
      );

      if ((newlyUnlocked && newlyUnlocked.length > 0) || archetypeData?.newlyAssigned) {
        badgeOpacity.value = withDelay(800, withTiming(1, { duration: 200 }));
        badgeScale.value = withDelay(800, withSpring(1, { damping: 8, stiffness: 200 }));
      }

      const delay = showConfetti || archetypeData?.newlyAssigned ? 3500 : 2000;
      setTimeout(() => navigation.goBack(), delay);
    } catch {
      const fallback = getReadinessScore({
        energy: payload.energy,
        soreness: payload.soreness,
        sleepHours: payload.sleepHours,
        mood: payload.mood,
        effort: payload.effortYesterday,
        pain: payload.painFlag,
      });
      setIsComplete(true);
      checkOpacity.value = withTiming(1, { duration: 200 });
      checkScale.value = withSequence(
        withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(2)) }),
        withDelay(100, withTiming(1, { duration: 200 })),
      );
      setErrorMessage(`Readiness: ${fallback.level}. Connect to server for full plans.`);
      setTimeout(() => navigation.goBack(), 2500);
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, painFlag, painLocation, navigation, checkOpacity, checkScale, showConfetti, profile?.sport, badgeOpacity, badgeScale]);

  // ---- Completion view ----
  if (isComplete) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
          <Animated.View style={[{
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 3,
            borderColor: accentColor,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.backgroundElevated,
            ...shadows.lg,
          }, checkStyle]}>
            <Ionicons name="checkmark" size={48} color={accentColor} />
          </Animated.View>

          <Animated.Text
            entering={FadeIn.delay(400).duration(400)}
            style={{
              fontFamily: fontFamily.bold,
              fontSize: 24,
              color: colors.textOnDark,
              marginTop: spacing.xl,
              textAlign: 'center',
            }}
          >
            You're locked in
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(600).duration(400)}
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 15,
              color: accentColor,
              marginTop: spacing.sm,
              textAlign: 'center',
            }}
          >
            {getCompletionMessage(archetype)}
          </Animated.Text>

          {milestoneReward && (
            <Animated.View style={[{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 107, 53, 0.12)',
              borderRadius: borderRadius.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.compact,
              marginTop: spacing.lg,
              gap: spacing.sm,
            }, badgeStyle]}>
              <Ionicons name="trophy" size={22} color={colors.accent1} />
              <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.accent1 }}>
                {milestoneReward}
              </Text>
            </Animated.View>
          )}

          {newArchetype && !milestoneReward && (
            <Animated.View style={[{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 107, 53, 0.12)',
              borderRadius: borderRadius.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.compact,
              marginTop: spacing.lg,
              gap: spacing.sm,
            }, badgeStyle]}>
              <Ionicons name="shield-checkmark" size={22} color={colors.accent1} />
              <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.accent1 }}>
                {getArchetypeProfile(newArchetype).name} Archetype Unlocked!
              </Text>
            </Animated.View>
          )}

          {errorMessage !== '' && (
            <Animated.View
              entering={FadeIn.delay(800).duration(300)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.readinessYellowBg,
                borderRadius: borderRadius.md,
                padding: spacing.md,
                marginTop: spacing.lg,
              }}
            >
              <Ionicons name="alert-circle" size={16} color={colors.readinessYellow} />
              <Text style={{
                fontFamily: fontFamily.regular,
                fontSize: 13,
                color: colors.readinessYellow,
                marginLeft: spacing.sm,
                flex: 1,
              }}>{errorMessage}</Text>
            </Animated.View>
          )}
        </View>

        {showConfetti && (
          <ConfettiCannon
            ref={confettiRef}
            count={80}
            origin={{ x: -10, y: 0 }}
            fadeOut
            autoStart
            fallSpeed={3000}
            colors={[colors.accent1, colors.accent2, colors.tierGold, colors.textPrimary]}
          />
        )}
      </SafeAreaView>
    );
  }

  // ---- Wizard ----
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header: back + dot progress */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
      }}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.inputBackground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Go back"
        >
          <Ionicons name={stepIndex === 0 ? 'close' : 'arrow-back'} size={20} color={colors.textInactive} />
        </Pressable>

        {/* Dot progress (Stories-style) */}
        <View style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 6,
          marginHorizontal: spacing.md,
        }}>
          {CHECKIN_STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= stepIndex ? colors.accent1 : colors.borderLight,
                maxWidth: 40,
              }}
            />
          ))}
        </View>

        {/* Skip button (only for skippable, non-last steps) */}
        {currentStep.skippable && !isLastStep ? (
          <Pressable onPress={goNext} hitSlop={12} accessibilityLabel="Skip question">
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted }}>
              Skip
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step content */}
        <Animated.View
          key={stepIndex}
          entering={FadeInRight.duration(250)}
          exiting={FadeOutLeft.duration(150)}
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingBottom: spacing.xl,
          }}
        >
          {/* Step icon */}
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 44 }}>
              {currentStep.type === 'pain' ? '\uD83E\uDE7A' :
               selectedEmojis[currentStep.key] != null
                ? STEP_EMOJIS[currentStep.key]?.[selectedEmojis[currentStep.key]]?.emoji
                : STEP_EMOJIS[currentStep.key]?.[2]?.emoji ?? '\uD83D\uDE42'}
            </Text>
          </View>

          {/* Question */}
          <Text style={{
            fontFamily: fontFamily.bold,
            fontSize: 28,
            color: colors.textOnDark,
            textAlign: 'center',
            letterSpacing: -0.5,
            marginBottom: spacing.xs,
          }}>
            {currentStep.label}
          </Text>
          <Text style={{
            fontFamily: fontFamily.regular,
            fontSize: 14,
            color: colors.textInactive,
            textAlign: 'center',
            marginBottom: spacing.xxl,
          }}>
            {currentStep.sublabel}
          </Text>

          {/* Emoji options (for non-pain steps) */}
          {currentStep.type !== 'pain' && STEP_EMOJIS[currentStep.key] && (
            <EmojiPicker
              options={STEP_EMOJIS[currentStep.key]}
              selectedIndex={selectedEmojis[currentStep.key] ?? -1}
              onSelect={(value, idx) => handleEmojiSelect(currentStep.key, value, idx)}
              accentColor={accentColor}
              colors={colors}
            />
          )}

          {/* Pain step */}
          {currentStep.type === 'pain' && (
            <PainToggle
              painFlag={painFlag}
              onToggle={setPainFlag}
              painLocation={painLocation}
              onLocationChange={setPainLocation}
              colors={colors}
            />
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom action — only on pain step (last step) */}
      {isLastStep && (
        <View style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xl,
          paddingTop: spacing.md,
        }}>
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
            accessibilityLabel="Submit check-in"
          >
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                paddingVertical: 16,
                borderRadius: borderRadius.lg,
                ...shadows.glowSubtle,
              }}
            >
              <Text style={{
                fontFamily: fontFamily.bold,
                fontSize: 16,
                color: colors.textPrimary,
                letterSpacing: 0.5,
              }}>
                {isSubmitting ? 'Submitting...' : 'Get My Plan'}
              </Text>
              {!isSubmitting && <Ionicons name="flash" size={20} color={colors.textPrimary} />}
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmojiPicker({
  options,
  selectedIndex,
  onSelect,
  accentColor,
  colors,
}: {
  options: EmojiOption[];
  selectedIndex: number;
  onSelect: (value: number, idx: number) => void;
  accentColor: string;
  colors: any;
}) {
  const emojiSize = Math.min(64, (SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 4) / 5);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.compact,
      }}>
        {options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <Pressable
              key={idx}
              onPress={() => onSelect(opt.value, idx)}
              style={({ pressed }) => ({
                alignItems: 'center',
                gap: spacing.xs,
                transform: [{ scale: pressed ? 0.9 : 1 }],
              })}
              accessibilityLabel={`${opt.label} - ${opt.emoji}`}
            >
              <View style={{
                width: emojiSize,
                height: emojiSize,
                borderRadius: emojiSize / 2,
                backgroundColor: isSelected
                  ? accentColor + '20'
                  : colors.inputBackground,
                borderWidth: isSelected ? 2.5 : 1,
                borderColor: isSelected ? accentColor : colors.borderLight,
                alignItems: 'center',
                justifyContent: 'center',
                ...(isSelected ? {
                  shadowColor: accentColor,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                  elevation: 6,
                } : {}),
              }}>
                <Text style={{ fontSize: emojiSize * 0.45 }}>{opt.emoji}</Text>
              </View>
              <Text style={{
                fontFamily: isSelected ? fontFamily.semiBold : fontFamily.regular,
                fontSize: 11,
                color: isSelected ? accentColor : colors.textMuted,
                textAlign: 'center',
              }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected value display */}
      {selectedIndex >= 0 && (
        <Animated.Text
          entering={FadeInDown.duration(200)}
          style={{
            fontFamily: fontFamily.bold,
            fontSize: 42,
            color: accentColor,
            textAlign: 'center',
            marginTop: spacing.xl,
          }}
        >
          {options[selectedIndex].emoji}
        </Animated.Text>
      )}
    </View>
  );
}

function PainToggle({
  painFlag,
  onToggle,
  painLocation,
  onLocationChange,
  colors,
}: {
  painFlag: boolean;
  onToggle: (v: boolean) => void;
  painLocation: string;
  onLocationChange: (v: string) => void;
  colors: any;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {/* No pain */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle(false);
          }}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingVertical: spacing.xl,
            borderRadius: borderRadius.xl,
            borderWidth: 2,
            borderColor: !painFlag ? colors.readinessGreen : colors.borderLight,
            backgroundColor: !painFlag ? colors.readinessGreenBg : colors.inputBackground,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
          accessibilityLabel="No pain"
        >
          <Text style={{ fontSize: 36 }}>{'\u2705'}</Text>
          <Text style={{
            fontFamily: fontFamily.semiBold,
            fontSize: 16,
            color: !painFlag ? colors.readinessGreen : colors.textInactive,
          }}>
            All good
          </Text>
        </Pressable>

        {/* Has pain */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle(true);
          }}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingVertical: spacing.xl,
            borderRadius: borderRadius.xl,
            borderWidth: 2,
            borderColor: painFlag ? colors.readinessRed : colors.borderLight,
            backgroundColor: painFlag ? colors.readinessRedBg : colors.inputBackground,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
          accessibilityLabel="Yes, I have pain"
        >
          <Text style={{ fontSize: 36 }}>{'\uD83E\uDE79'}</Text>
          <Text style={{
            fontFamily: fontFamily.semiBold,
            fontSize: 16,
            color: painFlag ? colors.readinessRed : colors.textInactive,
          }}>
            Something hurts
          </Text>
        </Pressable>
      </View>

      {painFlag && (
        <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: spacing.lg }}>
          <Text style={{
            fontFamily: fontFamily.medium,
            fontSize: 14,
            color: colors.textInactive,
            marginBottom: spacing.sm,
          }}>
            Where does it hurt?
          </Text>
          <TextInput
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 16,
              backgroundColor: colors.inputBackground,
              borderRadius: borderRadius.lg,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              color: colors.textOnDark,
            }}
            placeholder="e.g. left knee, right shoulder"
            placeholderTextColor={colors.textMuted}
            value={painLocation}
            onChangeText={onLocationChange}
          />
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: spacing.sm,
            backgroundColor: colors.readinessRedBg,
            padding: spacing.compact,
            borderRadius: borderRadius.sm,
            gap: spacing.xs,
          }}>
            <Ionicons name="alert-circle" size={14} color={colors.readinessRed} />
            <Text style={{
              fontFamily: fontFamily.regular,
              fontSize: 12,
              color: colors.textInactive,
              flex: 1,
            }}>
              Pain detected — REST will be recommended
            </Text>
          </View>
        </Animated.View>
      )}

      <Text style={{
        fontFamily: fontFamily.regular,
        fontSize: 11,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.lg,
      }}>
        This is not medical advice. Always consult a professional for injuries.
      </Text>
    </View>
  );
}
