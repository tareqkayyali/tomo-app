/**
 * Agility Shuffle Test Screen
 *
 * Uses Accelerometer to detect lateral movement + on-screen cues.
 * Flow:
 *   1. Instructions → 30s of LEFT/RIGHT cues
 *   2. Cues: on-screen arrow + vibration pattern (short=left, double=right)
 *   3. 10-12 cues, random 2-4s intervals
 *   4. Detect lateral movement via accelerometer
 *   5. Navigate to PhoneTestComplete with metrics
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'AgilityTest'>;
};

type Phase = 'instructions' | 'countdown' | 'active' | 'done';
type Direction = 'left' | 'right';

const TOTAL_CUES = 12;
const MOVEMENT_THRESHOLD = 0.5; // g — lateral movement detected
const CUE_DISPLAY_MS = 1500;

interface CueResult {
  direction: Direction;
  reactionMs: number;
  detected: boolean;
}

function randomDelay(): number {
  return 2000 + Math.random() * 2000; // 2-4s
}

function randomDirection(): Direction {
  return Math.random() < 0.5 ? 'left' : 'right';
}

export function AgilityTestScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [countdownNum, setCountdownNum] = useState(3);
  const [cueIndex, setCueIndex] = useState(0);
  const [currentDirection, setCurrentDirection] = useState<Direction | null>(null);
  const [showCue, setShowCue] = useState(false);
  const [lastReaction, setLastReaction] = useState<number | null>(null);

  const subscriptionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<CueResult[]>([]);
  const cueAppearedAtRef = useRef<number>(0);
  const movementDetectedRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  const countdownScale = useSharedValue(1);
  const arrowScale = useSharedValue(0);

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  const arrowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: arrowScale.value }],
    opacity: arrowScale.value,
  }));

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, []);

  const stopSensor = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  }, []);

  // Start countdown
  const handleStart = useCallback(() => {
    setPhase('countdown');
    setCountdownNum(3);

    let count = 3;
    const tick = () => {
      countdownScale.value = 1.5;
      countdownScale.value = withSpring(1, { damping: 10, stiffness: 200 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (count <= 0) {
        beginTest();
        return;
      }
      setCountdownNum(count);
      count--;
      timerRef.current = setTimeout(tick, 1000);
    };
    tick();
  }, []);

  // Begin the agility test
  const beginTest = useCallback(() => {
    setPhase('active');
    startTimeRef.current = Date.now();
    resultsRef.current = [];
    showNextCue(0);
  }, []);

  // Show next directional cue
  const showNextCue = useCallback(async (index: number) => {
    if (index >= TOTAL_CUES) {
      finishTest();
      return;
    }

    setCueIndex(index);
    setShowCue(false);
    setLastReaction(null);
    movementDetectedRef.current = false;

    const delay = index === 0 ? 1000 : randomDelay();

    timerRef.current = setTimeout(async () => {
      const dir = randomDirection();
      setCurrentDirection(dir);
      setShowCue(true);
      cueAppearedAtRef.current = Date.now();

      // Animate arrow
      arrowScale.value = 0;
      arrowScale.value = withSpring(1, { damping: 8, stiffness: 300 });

      // Haptic cue: single for left, double for right
      if (dir === 'left') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
      }

      // Listen for lateral movement
      await Accelerometer.setUpdateInterval(10);
      subscriptionRef.current = Accelerometer.addListener(({ x }) => {
        // x-axis = lateral movement
        if (movementDetectedRef.current) return;

        const expectedDir = dir === 'left' ? -1 : 1;
        // Check if movement matches expected direction
        if (Math.abs(x) > MOVEMENT_THRESHOLD && (x * expectedDir > 0 || Math.abs(x) > MOVEMENT_THRESHOLD * 1.5)) {
          movementDetectedRef.current = true;
          const reactionMs = Date.now() - cueAppearedAtRef.current;

          resultsRef.current.push({
            direction: dir,
            reactionMs,
            detected: true,
          });

          setLastReaction(reactionMs);
          stopSensor();

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      });

      // Timeout for this cue — move on after CUE_DISPLAY_MS
      timerRef.current = setTimeout(() => {
        if (!movementDetectedRef.current) {
          resultsRef.current.push({
            direction: dir,
            reactionMs: CUE_DISPLAY_MS,
            detected: false,
          });
        }
        stopSensor();
        setShowCue(false);
        showNextCue(index + 1);
      }, CUE_DISPLAY_MS);
    }, delay);
  }, [stopSensor]);

  // Finish the test
  const finishTest = useCallback(() => {
    setPhase('done');
    stopSensor();
    Vibration.vibrate(300);

    const results = resultsRef.current;
    const detected = results.filter((r) => r.detected);
    const totalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);

    if (detected.length === 0) {
      setTimeout(() => navigation.goBack(), 1500);
      return;
    }

    const avgReaction = Math.round(detected.reduce((a, r) => a + r.reactionMs, 0) / detected.length);
    const bestReaction = Math.min(...detected.map((r) => r.reactionMs));
    const movementQuality = Math.round((detected.length / results.length) * 100);

    setTimeout(() => {
      navigation.replace('PhoneTestComplete', {
        testId: 'agility-shuffle',
        testName: 'Agility Shuffle',
        category: 'agility',
        primaryScore: avgReaction,
        unit: 'ms',
        metrics: {
          avgReactionMs: avgReaction,
          bestReactionMs: bestReaction,
          movementQuality,
          totalShuffles: detected.length,
        },
        durationSeconds: totalDuration,
      });
    }, 500);
  }, [navigation, stopSensor]);

  // ── Instructions ──
  if (phase === 'instructions') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.instructionsWrap}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
            <Ionicons name="swap-horizontal-outline" size={40} color={colors.accent} />
          </View>
          <Text style={styles.title}>Agility Shuffle</Text>
          <Text style={styles.subtitle}>React to directional cues as fast as possible</Text>

          <View style={styles.stepsList}>
            {[
              'Hold phone in front of you',
              'Arrows will show LEFT or RIGHT',
              'Shuffle in that direction as fast as you can',
              `${TOTAL_CUES} cues total — react quickly!`,
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
              colors={[colors.accent, '#2ECC71CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButton}
            >
              <Ionicons name="play" size={22} color={colors.textPrimary} />
              <Text style={styles.startText}>Start Test</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} style={styles.backWrap}>
            <Text style={styles.backText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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
      {/* Progress */}
      <View style={styles.progressBar}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${(cueIndex / TOTAL_CUES) * 100}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {Math.min(cueIndex + 1, TOTAL_CUES)} / {TOTAL_CUES}
        </Text>
      </View>

      <View style={styles.centerContent}>
        {showCue && currentDirection && phase === 'active' && (
          <Animated.View style={arrowAnimStyle}>
            <Ionicons
              name={currentDirection === 'left' ? 'arrow-back' : 'arrow-forward'}
              size={120}
              color={colors.accent}
            />
            <Text style={styles.directionLabel}>
              {currentDirection.toUpperCase()}!
            </Text>
          </Animated.View>
        )}

        {!showCue && phase === 'active' && (
          <View style={styles.waitingWrap}>
            <Ionicons name="ellipsis-horizontal" size={40} color={colors.textInactive} />
            <Text style={styles.waitText}>Get ready...</Text>
          </View>
        )}

        {lastReaction !== null && (
          <Text style={styles.reactionFeedback}>{lastReaction} ms</Text>
        )}

        {phase === 'done' && (
          <View style={styles.doneWrap}>
            <Ionicons name="checkmark-circle" size={80} color={colors.accent} />
            <Text style={styles.doneText}>Done!</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    textAlign: 'center',
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
    color: colors.accent,
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
  backWrap: { paddingVertical: spacing.md },
  backText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },

  // Countdown
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
    color: colors.accent,
    lineHeight: 130,
  },

  // Active
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    minWidth: 50,
    textAlign: 'right',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
  },
  directionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  waitingWrap: {
    alignItems: 'center',
  },
  waitText: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    color: colors.textInactive,
    marginTop: spacing.sm,
  },
  reactionFeedback: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.accent2,
    marginTop: spacing.lg,
  },

  // Done
  doneWrap: {
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
