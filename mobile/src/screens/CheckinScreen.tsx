/**
 * Check-in Screen — Step-by-step wizard
 *
 * One question at a time for clarity and calmness.
 * Archetype-colored progress bar, large touch targets,
 * calm labels, animated transitions.
 *
 * SAFETY: Pain flag always triggers REST recommendation.
 * "This is not medical advice" disclaimer on pain step.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  FadeIn,
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
import { ProgressBar } from '../components';
import { colors, spacing, typography, borderRadius, shadows, fontFamily, layout } from '../theme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import { submitCheckin } from '../services/api';
import { getReadinessScore } from '../services/readinessScore';
import { track } from '../services/analytics';
import { useAuth } from '../hooks/useAuth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { CheckinResponse } from '../types';

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
// Step configuration (pure, exported for testing)
// ---------------------------------------------------------------------------

export const CHECKIN_STEPS: CheckinStep[] = [
  {
    key: 'mood',
    label: 'How are you feeling today?',
    sublabel: 'Overall mood right now',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low',
    highLabel: 'Great',
    skippable: true,
  },
  {
    key: 'sleepHours',
    label: 'How much sleep did you get?',
    sublabel: 'Hours of sleep last night',
    type: 'sleep',
    min: 4,
    max: 12,
    skippable: true,
  },
  {
    key: 'energy',
    label: 'What is your energy level?',
    sublabel: 'How energized do you feel',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'Low energy',
    highLabel: 'High energy',
    skippable: true,
  },
  {
    key: 'soreness',
    label: 'Any muscle soreness?',
    sublabel: 'Overall body soreness',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'None',
    highLabel: 'Very sore',
    skippable: true,
  },
  {
    key: 'academicStress',
    label: 'Academic stress today?',
    sublabel: 'Exams, homework, or study load',
    type: 'slider',
    min: 1,
    max: 10,
    lowLabel: 'None',
    highLabel: 'Very high',
    skippable: true,
  },
  {
    key: 'effortYesterday',
    label: "Yesterday's training effort?",
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

/** Progress fraction: 0 at step 0, 1 at final step. */
export function getProgressPercent(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 1) return stepIndex >= 1 ? 1 : 0;
  return Math.max(0, Math.min(1, stepIndex / (totalSteps - 1)));
}

/** Default value for a step key. */
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

/** Human-readable display for a value on a given step. */
export function getValueDisplay(key: string, value: number): string {
  if (key === 'sleepHours') return `${value}h`;
  return `${value}/10`;
}

/** Build the API payload from wizard answers. */
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

/** Calm completion message per archetype. */
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
// Muted pain rose (calm, not aggressive red)
// ---------------------------------------------------------------------------

const PAIN_RED = colors.readinessRed;         // #FF453A — vivid on dark bg
const PAIN_RED_BG = colors.readinessRedBg;    // rgba(255,69,58,0.15)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckinScreen({ navigation }: CheckinScreenProps) {
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

  // Animated badge pop (for archetype/milestone)
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
  const progress = getProgressPercent(stepIndex, CHECKIN_STEPS.length);

  const goNext = useCallback(() => {
    if (isLastStep) return;
    setStepIndex((i) => i + 1);
  }, [isLastStep]);

  const goBack = useCallback(() => {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const setAnswer = useCallback((key: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    // Medium impact haptic on submit
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

      // Check for milestone unlocks
      const newlyUnlocked = response.gamification?.milestones?.newlyUnlocked;
      if (newlyUnlocked && newlyUnlocked.length > 0) {
        track('streak_milestone', { milestone: newlyUnlocked[0].id, streak: response.gamification?.streak?.currentStreak });
        setMilestoneReward(newlyUnlocked[0].reward);
        setShowConfetti(true);
        // Extra celebration haptic
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }

      // Check for archetype assignment
      const archetypeData = response.gamification?.archetype;
      if (archetypeData?.newlyAssigned && archetypeData.archetype) {
        setNewArchetype(archetypeData.archetype);
      }

      // Success haptic on completion
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Animate checkmark
      checkOpacity.value = withTiming(1, { duration: 200 });
      checkScale.value = withSequence(
        withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(2)) }),
        withDelay(100, withTiming(1, { duration: 200 })),
      );

      // Badge pop animation (delayed after checkmark)
      if ((newlyUnlocked && newlyUnlocked.length > 0) || archetypeData?.newlyAssigned) {
        badgeOpacity.value = withDelay(800, withTiming(1, { duration: 200 }));
        badgeScale.value = withDelay(
          800,
          withSpring(1, { damping: 8, stiffness: 200 }),
        );
      }

      // Delay navigation to show celebration
      const delay = showConfetti || archetypeData?.newlyAssigned ? 3500 : 2000;
      setTimeout(() => navigation.goBack(), delay);
    } catch {
      // Fallback: compute readiness locally
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
      setErrorMessage(
        `Readiness: ${fallback.level}. Connect to server for full plans.`,
      );
      setTimeout(() => navigation.goBack(), 2500);
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, painFlag, painLocation, navigation, checkOpacity, checkScale]);

  // ---- Completion view ----
  if (isComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.completionContainer}>
          <Animated.View style={[styles.checkCircle, { borderColor: accentColor }, checkStyle]}>
            <Ionicons name="checkmark" size={48} color={accentColor} />
          </Animated.View>
          <Animated.Text
            entering={FadeIn.delay(400).duration(400)}
            style={styles.completionTitle}
          >
            Check-in complete
          </Animated.Text>
          <Animated.Text
            entering={FadeIn.delay(600).duration(400)}
            style={[styles.completionMessage, { color: accentColor }]}
          >
            {getCompletionMessage(archetype)}
          </Animated.Text>

          {/* Milestone Badge Pop */}
          {milestoneReward && (
            <Animated.View style={[styles.celebrationBadge, badgeStyle]}>
              <Ionicons name="trophy" size={22} color={colors.accent1} />
              <Text style={styles.celebrationText}>{milestoneReward}</Text>
            </Animated.View>
          )}

          {/* Archetype Badge Pop */}
          {newArchetype && !milestoneReward && (
            <Animated.View style={[styles.celebrationBadge, badgeStyle]}>
              <Ionicons name="shield-checkmark" size={22} color={colors.accent1} />
              <Text style={styles.celebrationText}>
                {getArchetypeProfile(newArchetype).name} Archetype Unlocked!
              </Text>
            </Animated.View>
          )}

          {errorMessage !== '' && (
            <Animated.View
              entering={FadeIn.delay(800).duration(300)}
              style={styles.fallbackBanner}
            >
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <Text style={styles.fallbackText}>{errorMessage}</Text>
            </Animated.View>
          )}
        </View>

        {/* Confetti Cannon */}
        {showConfetti && (
          <ConfettiCannon
            ref={confettiRef}
            count={80}
            origin={{ x: -10, y: 0 }}
            fadeOut
            autoStart
            fallSpeed={3000}
            colors={[colors.accent1, colors.accent2, '#FFD700', '#FFFFFF']}
          />
        )}
      </SafeAreaView>
    );
  }

  // ---- Wizard ----
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Progress bar */}
      <View style={styles.progressArea}>
        <ProgressBar progress={progress} color={accentColor} height={6} />
        <Text style={styles.stepCounter}>
          {stepIndex + 1} of {CHECKIN_STEPS.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        {stepIndex > 0 && (
          <Pressable onPress={goBack} style={styles.backButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={colors.textInactive} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        )}

        {/* Step content */}
        <Animated.View
          key={stepIndex}
          entering={FadeInRight.duration(300)}
          exiting={FadeOutLeft.duration(200)}
          style={styles.stepContent}
        >
          <Text style={styles.stepLabel}>{currentStep.label}</Text>
          <Text style={styles.stepSublabel}>{currentStep.sublabel}</Text>

          {/* Slider-type step */}
          {currentStep.type === 'slider' && (
            <SliderGrid
              min={currentStep.min!}
              max={currentStep.max!}
              value={answers[currentStep.key]}
              onChange={(v) => setAnswer(currentStep.key, v)}
              lowLabel={currentStep.lowLabel!}
              highLabel={currentStep.highLabel!}
              accentColor={accentColor}
            />
          )}

          {/* Sleep-type step */}
          {currentStep.type === 'sleep' && (
            <SleepGrid
              min={currentStep.min!}
              max={currentStep.max!}
              value={answers[currentStep.key]}
              onChange={(v) => setAnswer(currentStep.key, v)}
              accentColor={accentColor}
            />
          )}

          {/* Pain step */}
          {currentStep.type === 'pain' && (
            <PainToggle
              painFlag={painFlag}
              onToggle={setPainFlag}
              painLocation={painLocation}
              onLocationChange={setPainLocation}
            />
          )}

          {/* Value display */}
          {currentStep.type !== 'pain' && (
            <Text style={[styles.valueDisplay, { color: accentColor }]}>
              {getValueDisplay(currentStep.key, answers[currentStep.key])}
            </Text>
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom action area */}
      <View style={styles.bottomArea}>
        {isLastStep ? (
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.nextButton, { backgroundColor: accentColor, opacity: isSubmitting ? 0.6 : 1 }]}
            accessibilityLabel="Submit check-in"
          >
            <Text style={styles.nextButtonText}>
              {isSubmitting ? 'Submitting...' : 'Get My Plan'}
            </Text>
            {!isSubmitting && <Ionicons name="fitness" size={20} color="#FFFFFF" />}
          </Pressable>
        ) : (
          <Pressable
            onPress={goNext}
            style={[styles.nextButton, { backgroundColor: accentColor }]}
            accessibilityLabel="Next question"
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>
        )}

        {currentStep.skippable && !isLastStep && (
          <Pressable onPress={goNext} style={styles.skipButton} accessibilityLabel="Skip question">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SliderGrid({
  min,
  max,
  value,
  onChange,
  lowLabel,
  highLabel,
  accentColor,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
  accentColor: string;
}) {
  const options = [];
  for (let i = min; i <= max; i++) options.push(i);

  return (
    <View style={styles.gridContainer}>
      <View style={styles.gridRow}>
        {options.map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[
              styles.gridButton,
              value === n && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            accessibilityLabel={`Select ${n}`}
          >
            <Text
              style={[
                styles.gridButtonText,
                value === n && styles.gridButtonTextSelected,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.gridLabels}>
        <Text style={styles.gridLabelText}>{lowLabel}</Text>
        <Text style={styles.gridLabelText}>{highLabel}</Text>
      </View>
    </View>
  );
}

function SleepGrid({
  min,
  max,
  value,
  onChange,
  accentColor,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  accentColor: string;
}) {
  const options = [];
  for (let i = min; i <= max; i++) options.push(i);

  return (
    <View style={styles.gridContainer}>
      <View style={styles.gridRow}>
        {options.map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[
              styles.sleepGridButton,
              value === n && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            accessibilityLabel={`Select ${n} hours`}
          >
            <Text
              style={[
                styles.gridButtonText,
                value === n && styles.gridButtonTextSelected,
              ]}
            >
              {n}h
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PainToggle({
  painFlag,
  onToggle,
  painLocation,
  onLocationChange,
}: {
  painFlag: boolean;
  onToggle: (v: boolean) => void;
  painLocation: string;
  onLocationChange: (v: string) => void;
}) {
  return (
    <View style={styles.painContainer}>
      <View style={styles.painToggleRow}>
        <Pressable
          onPress={() => onToggle(false)}
          style={[
            styles.painChoice,
            !painFlag && styles.painChoiceNo,
          ]}
          accessibilityLabel="No pain"
        >
          <Ionicons
            name="checkmark-circle"
            size={24}
            color={!painFlag ? colors.readinessGreen : colors.textMuted}
          />
          <Text style={[styles.painChoiceText, !painFlag && { color: colors.readinessGreen }]}>
            No
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onToggle(true)}
          style={[
            styles.painChoice,
            painFlag && styles.painChoiceYes,
          ]}
          accessibilityLabel="Yes, I have pain"
        >
          <Ionicons
            name="medkit"
            size={24}
            color={painFlag ? PAIN_RED : colors.textMuted}
          />
          <Text style={[styles.painChoiceText, painFlag && { color: PAIN_RED }]}>
            Yes
          </Text>
        </Pressable>
      </View>

      {painFlag && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.painExpanded}>
          <Text style={styles.painLocationLabel}>Where does it hurt?</Text>
          <TextInput
            style={styles.painInput}
            placeholder="e.g. left knee, right shoulder"
            placeholderTextColor={colors.textMuted}
            value={painLocation}
            onChangeText={onLocationChange}
          />
          <View style={styles.painWarning}>
            <Ionicons name="alert-circle" size={16} color={PAIN_RED} />
            <Text style={styles.painWarningText}>
              Pain detected — REST will be recommended. This is not medical advice.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Always-visible disclaimer */}
      <Text style={styles.disclaimer}>
        This is not medical advice. Always consult a professional for injuries.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,              // #1A1D2E
  },
  progressArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  stepCounter: {
    ...typography.caption,
    color: colors.textInactive,                       // #8E8E93
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  backText: {
    ...typography.bodySmall,
    color: colors.textInactive,                       // gray, readable on dark
    marginLeft: spacing.xs,
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xl,
  },
  stepLabel: {
    ...typography.h2,
    color: colors.textOnDark,                         // #FFFFFF
    marginBottom: spacing.xs,
  },
  stepSublabel: {
    ...typography.bodyOnDark,
    color: colors.textInactive,                       // #8E8E93
    marginBottom: spacing.xl,
  },

  // ── Grid (slider numbers) ─────────────────────────────────────────
  gridContainer: {
    marginTop: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  gridButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderLight,                  // subtle white border on dark
    backgroundColor: colors.backgroundElevated,       // #222538
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepGridButton: {
    paddingHorizontal: spacing.md,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.textInactive,                       // gray when not selected
  },
  gridButtonTextSelected: {
    color: '#FFFFFF',
    fontFamily: fontFamily.semiBold,
  },
  gridLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  gridLabelText: {
    ...typography.caption,
    color: colors.textMuted,                          // #6E6E73
  },

  // ── Value display ─────────────────────────────────────────────────
  valueDisplay: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    lineHeight: 44,
    color: colors.textOnDark,                         // overridden inline with accentColor
    textAlign: 'center',
    marginTop: spacing.lg,
  },

  // ── Pain ──────────────────────────────────────────────────────────
  painContainer: {
    marginTop: spacing.md,
  },
  painToggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  painChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundElevated,       // dark card
  },
  painChoiceNo: {
    backgroundColor: colors.readinessGreenBg,         // rgba green tint
    borderColor: colors.readinessGreen,
  },
  painChoiceYes: {
    backgroundColor: PAIN_RED_BG,                     // rgba red tint
    borderColor: PAIN_RED,
  },
  painChoiceText: {
    ...typography.button,
    color: colors.textInactive,
  },
  painExpanded: {
    marginTop: spacing.lg,
  },
  painLocationLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  painInput: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    backgroundColor: colors.backgroundElevated,       // dark input bg
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textOnDark,                         // white text in input
  },
  painWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: PAIN_RED_BG,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  painWarningText: {
    ...typography.caption,
    color: colors.textInactive,                       // #8E8E93 — "not medical advice"
    marginLeft: spacing.xs,
    flex: 1,
  },

  // ── Disclaimer ─────────────────────────────────────────────────────
  disclaimer: {
    ...typography.caption,
    color: colors.textInactive,                       // #8E8E93 gray
    textAlign: 'center',
    marginTop: spacing.lg,
  },

  // ── Bottom area ───────────────────────────────────────────────────
  bottomArea: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.glowSubtle,                            // subtle orange glow
  },
  nextButtonText: {
    ...typography.button,
    color: '#FFFFFF',                                 // white text on orange button
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  skipText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },

  // ── Completion ────────────────────────────────────────────────────
  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,       // dark circle bg
    ...shadows.lg,
  },
  completionTitle: {
    ...typography.h2,
    color: colors.textOnDark,                         // white
    marginTop: spacing.xl,
  },
  completionMessage: {
    ...typography.bodyOnDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessYellowBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  fallbackText: {
    ...typography.bodySmall,
    color: colors.readinessYellow,
    marginLeft: spacing.sm,
    flex: 1,
  },

  // ── Celebration badge ────────────────────────────────────────────
  celebrationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.compact,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  celebrationText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.accent1,
  },
});
