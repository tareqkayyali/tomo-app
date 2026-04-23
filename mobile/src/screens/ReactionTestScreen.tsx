/**
 * Reaction Speed Test Screen
 *
 * THE STAR FEATURE — pure React Native, no sensors needed.
 *
 * Flow:
 *   1. Instructions → "Start Test" button
 *   2. Countdown: 3 → 2 → 1 → GO
 *   3. Active: 15 colored circles appear at random positions with random delays
 *      - Tap each as fast as you can
 *      - Reaction time measured per target
 *      - Haptic feedback on tap
 *   4. Auto-navigate to PhoneTestComplete with metrics
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  screenBg,
} from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'ReactionTest'>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN = Dimensions.get('window');
const TARGET_SIZE = 70;
const TOTAL_TARGETS = 15;
const TARGET_COLORS = [colors.accent, colors.textSecondary, colors.accentLight, colors.accentDark];

// Safe area for target placement
const PADDING_H = 40;
const PADDING_TOP = 120;
const PADDING_BOTTOM = 200;
const SAFE_W = SCREEN.width - PADDING_H * 2 - TARGET_SIZE;
const SAFE_H = SCREEN.height - PADDING_TOP - PADDING_BOTTOM - TARGET_SIZE;

type Phase = 'instructions' | 'countdown' | 'active' | 'done';

function randomPos() {
  return {
    x: PADDING_H + Math.random() * SAFE_W,
    y: PADDING_TOP + Math.random() * SAFE_H,
  };
}

function randomColor() {
  return TARGET_COLORS[Math.floor(Math.random() * TARGET_COLORS.length)];
}

function randomDelay() {
  return 800 + Math.random() * 2000; // 0.8–2.8s
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReactionTestScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [countdownNum, setCountdownNum] = useState(3);
  const [targetIndex, setTargetIndex] = useState(0);
  const [targetVisible, setTargetVisible] = useState(false);
  const [targetPos, setTargetPos] = useState(randomPos());
  const [targetColor, setTargetColor] = useState(randomColor());

  const reactionTimesRef = useRef<number[]>([]);
  const targetAppearedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Animated values
  const targetScale = useSharedValue(0);
  const targetOpacity = useSharedValue(0);
  const countdownScale = useSharedValue(1);

  const targetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: targetScale.value }],
    opacity: targetOpacity.value,
  }));

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Start countdown ──
  const handleStart = useCallback(() => {
    setPhase('countdown');
    setCountdownNum(3);

    let count = 3;
    const tick = () => {
      countdownScale.value = 1.5;
      countdownScale.value = withSpring(1, { damping: 10, stiffness: 200 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (count <= 0) {
        setPhase('active');
        startTimeRef.current = Date.now();
        showNextTarget(0);
        return;
      }
      setCountdownNum(count);
      count--;
      timerRef.current = setTimeout(tick, 1000);
    };
    tick();
  }, []);

  // ── Show next target ──
  const showNextTarget = useCallback((index: number) => {
    if (index >= TOTAL_TARGETS) {
      finishTest();
      return;
    }

    setTargetIndex(index);
    setTargetVisible(false);

    const delay = randomDelay();
    timerRef.current = setTimeout(() => {
      const pos = randomPos();
      setTargetPos(pos);
      setTargetColor(randomColor());
      setTargetVisible(true);
      targetAppearedAtRef.current = Date.now();

      // Animate target appearing
      targetScale.value = 0;
      targetOpacity.value = 0;
      targetScale.value = withSpring(1, { damping: 12, stiffness: 300 });
      targetOpacity.value = withTiming(1, { duration: 100 });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, delay);
  }, []);

  // ── Handle tap ──
  const handleTap = useCallback(() => {
    if (!targetVisible) return;

    const reactionTime = Date.now() - targetAppearedAtRef.current;
    reactionTimesRef.current.push(reactionTime);

    // Tap feedback
    targetScale.value = withTiming(0, { duration: 150 });
    targetOpacity.value = withTiming(0, { duration: 150 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    setTargetVisible(false);

    // Show next target
    showNextTarget(targetIndex + 1);
  }, [targetVisible, targetIndex, showNextTarget]);

  // ── Finish test ──
  const finishTest = useCallback(() => {
    setPhase('done');
    Vibration.vibrate(300);

    const times = reactionTimesRef.current;
    if (times.length === 0) {
      navigation.goBack();
      return;
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stddev = Math.sqrt(times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length);
    const consistency = Math.round(Math.max(0, Math.min(100, 100 - (stddev / mean) * 100)));
    const totalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);

    setTimeout(() => {
      navigation.replace('PhoneTestComplete', {
        testId: 'reaction-tap',
        testName: 'Reaction Speed',
        category: 'reaction',
        primaryScore: avg,
        unit: 'ms',
        metrics: {
          avgReactionMs: avg,
          bestReactionMs: best,
          worstReactionMs: worst,
          consistency,
          targetsHit: times.length,
        },
        durationSeconds: totalDuration,
      });
    }, 500);
  }, [navigation]);

  // ── Instructions ──
  if (phase === 'instructions') {
    return (
      <PlayerScreen label="TEST" title="Reaction" onBack={() => navigation.goBack()}>
        <View style={styles.instructionsWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <SmartIcon name="hand-left-outline" size={40} color={colors.accent1} />
          </View>
          <Text style={styles.title}>Reaction Speed</Text>
          <Text style={styles.subtitle}>Tap colored targets as fast as you can</Text>

          <View style={styles.stepsList}>
            {[
              'Hold your phone in portrait mode',
              `${TOTAL_TARGETS} colored circles will appear at random spots`,
              'Tap each circle as fast as possible',
              'Your reaction time is measured for each tap',
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={handleStart} style={styles.startWrap}>
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButton}
            >
              <SmartIcon name="play" size={22} color={colors.textPrimary} />
              <Text style={styles.startText}>Start Test</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} style={styles.backWrap}>
            <Text style={styles.backText}>Go Back</Text>
          </Pressable>
        </View>
      </PlayerScreen>
    );
  }

  // ── Countdown ──
  if (phase === 'countdown') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.countdownWrap}>
          <Text style={styles.getReady}>Get Ready</Text>
          <Animated.Text style={[styles.countdownNum, countdownAnimStyle]}>
            {countdownNum}
          </Animated.Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Active / Done ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${((targetIndex) / TOTAL_TARGETS) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {Math.min(targetIndex + 1, TOTAL_TARGETS)} / {TOTAL_TARGETS}
        </Text>
      </View>

      {/* Target area */}
      <Pressable style={styles.activeArea} onPress={handleTap}>
        {targetVisible && (
          <Animated.View
            style={[
              styles.target,
              targetAnimStyle,
              {
                left: targetPos.x,
                top: targetPos.y,
                backgroundColor: targetColor,
              },
            ]}
          />
        )}

        {!targetVisible && phase === 'active' && (
          <Text style={styles.waitText}>Wait for it...</Text>
        )}

        {phase === 'done' && (
          <View style={styles.doneWrap}>
            <SmartIcon name="checkmark-circle" size={80} color={colors.success} />
            <Text style={styles.doneText}>Done!</Text>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: screenBg,
  },

  // ── Instructions ────────────────────────────────────────────────────
  instructionsWrap: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  stepsList: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.accent1,
  },
  stepText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textOnDark,
    flex: 1,
  },
  startWrap: {
    width: '100%',
    marginBottom: spacing.md,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: borderRadius.xl,
  },
  startText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  backWrap: {
    paddingVertical: spacing.md,
  },
  backText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },

  // ── Countdown ──────────────────────────────────────────────────────
  countdownWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getReady: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    color: colors.textInactive,
    marginBottom: spacing.lg,
  },
  countdownNum: {
    fontFamily: fontFamily.bold,
    fontSize: 120,
    color: colors.accent1,
    lineHeight: 130,
  },

  // ── Active ─────────────────────────────────────────────────────────
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.creamMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent1,
  },
  progressText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    minWidth: 50,
    textAlign: 'right',
  },
  activeArea: {
    flex: 1,
    position: 'relative',
  },
  target: {
    position: 'absolute',
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    borderRadius: TARGET_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  waitText: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 18,
    color: colors.textInactive,
  },

  // ── Done ───────────────────────────────────────────────────────────
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    color: colors.accent,
    marginTop: spacing.md,
  },
});
