/**
 * Sprint Speed Test Screen
 *
 * Uses Accelerometer to detect movement start and measure sprint duration.
 * Flow:
 *   1. Instructions → hold phone in hand
 *   2. Calibrate → "GO!" beep
 *   3. Auto-detect movement start → timer running
 *   4. Manual STOP button (primary) + auto-stop on deceleration (secondary)
 *   5. Max 15 seconds → navigate to PhoneTestComplete
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
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
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
  navigation: NativeStackNavigationProp<MainStackParamList, 'SprintTest'>;
};

type Phase = 'instructions' | 'countdown' | 'calibrating' | 'waiting' | 'running' | 'done';

const MAX_DURATION_SEC = 15;
const SPRINT_START_THRESHOLD = 1.3; // g — movement detected
const DECEL_THRESHOLD = 0.3;        // g — stopped moving (below this for 500ms)
const DECEL_WINDOW_MS = 500;

export function SprintTestScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [countdownNum, setCountdownNum] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [statusText, setStatusText] = useState('');

  const subscriptionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const calibrationRef = useRef<number>(1.0);
  const peakAccelRef = useRef<number>(0);
  const avgAccelRef = useRef<number[]>([]);
  const decelStartRef = useRef<number | null>(null);

  const countdownScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, []);

  const stopAll = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
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
        startCalibration();
        return;
      }
      setCountdownNum(count);
      count--;
      timerRef.current = setTimeout(tick, 1000);
    };
    tick();
  }, []);

  // Calibrate resting acceleration
  const startCalibration = useCallback(async () => {
    setPhase('calibrating');
    setStatusText('Hold still...');

    const calSamples: number[] = [];
    await Accelerometer.setUpdateInterval(20);

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.sqrt(x * x + y * y + z * z);
      calSamples.push(mag);
    });

    timerRef.current = setTimeout(() => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      if (calSamples.length > 0) {
        calibrationRef.current = calSamples.reduce((a, b) => a + b, 0) / calSamples.length;
      }

      waitForSprint();
    }, 2000);
  }, []);

  // Wait for movement to start
  const waitForSprint = useCallback(async () => {
    setPhase('waiting');
    setStatusText('GO! Start sprinting!');
    peakAccelRef.current = 0;
    avgAccelRef.current = [];

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate(200);

    pulseOpacity.value = withRepeat(
      withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    await Accelerometer.setUpdateInterval(10);

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.sqrt(x * x + y * y + z * z);
      const normalizedG = mag / calibrationRef.current;

      if (normalizedG > SPRINT_START_THRESHOLD) {
        // Movement detected — start timing
        startSprinting();
      }
    });

    // Auto-timeout after 10s of waiting
    timerRef.current = setTimeout(() => {
      stopAll();
      setStatusText('No movement detected');
      setPhase('done');
      timerRef.current = setTimeout(() => navigation.goBack(), 2000);
    }, 10000);
  }, []);

  // Sprint is active
  const startSprinting = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    setPhase('running');
    startTimeRef.current = Date.now();
    decelStartRef.current = null;

    // Update display timer
    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 50);

    await Accelerometer.setUpdateInterval(10);

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.sqrt(x * x + y * y + z * z);
      const normalizedG = mag / calibrationRef.current;

      avgAccelRef.current.push(normalizedG);
      if (normalizedG > peakAccelRef.current) {
        peakAccelRef.current = normalizedG;
      }

      // Auto-stop: detect deceleration (low movement for DECEL_WINDOW_MS)
      if (normalizedG < DECEL_THRESHOLD + 1.0) {
        if (!decelStartRef.current) {
          decelStartRef.current = Date.now();
        } else if (Date.now() - decelStartRef.current > DECEL_WINDOW_MS) {
          // Has been decelerating long enough — stopped
          handleStop();
        }
      } else {
        decelStartRef.current = null;
      }
    });

    // Max duration auto-stop
    timerRef.current = setTimeout(() => {
      handleStop();
    }, MAX_DURATION_SEC * 1000);
  }, []);

  // Stop sprint
  const handleStop = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    stopAll();

    setPhase('done');
    setElapsedMs(elapsed);
    Vibration.vibrate(300);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const durationSec = Math.round(elapsed / 10) / 100; // 2 decimal places
    const peak = Math.round(peakAccelRef.current * 10) / 10;
    const avg = avgAccelRef.current.length > 0
      ? Math.round((avgAccelRef.current.reduce((a, b) => a + b, 0) / avgAccelRef.current.length) * 10) / 10
      : 0;

    setTimeout(() => {
      navigation.replace('PhoneTestComplete', {
        testId: 'sprint-speed',
        testName: 'Sprint Speed',
        category: 'speed',
        primaryScore: durationSec,
        unit: 's',
        metrics: {
          sprintTimeSec: durationSec,
          peakAccelG: peak,
          avgAccelG: avg,
        },
        durationSeconds: Math.ceil(elapsed / 1000),
      });
    }, 800);
  }, [navigation, stopAll]);

  const formatTime = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return `${sec}.${String(centis).padStart(2, '0')}`;
  };

  // ── Instructions ──
  if (phase === 'instructions') {
    return (
      <PlayerScreen label="TEST" title="Sprint" onBack={() => navigation.goBack()}>
        <View style={styles.instructionsWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <SmartIcon name="speedometer-outline" size={40} color={colors.success} />
          </View>
          <Text style={styles.title}>Sprint Speed</Text>
          <Text style={styles.subtitle}>Time your sprint with phone accelerometer</Text>

          <View style={styles.stepsList}>
            {[
              'Hold phone securely in your hand',
              'Stand at your starting position',
              'Timer starts when you start moving',
              'Press STOP when done or it auto-detects',
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
              colors={[colors.accent, colors.accent]}
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

  // ── Active ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.centerContent}>
        {phase === 'calibrating' && (
          <>
            <SmartIcon name="body-outline" size={60} color={colors.textInactive} />
            <Text style={styles.statusLabel}>Calibrating...</Text>
            <Text style={styles.statusSub}>Hold still for 2 seconds</Text>
          </>
        )}

        {phase === 'waiting' && (
          <Animated.View style={[styles.goContainer, pulseStyle]}>
            <Text style={styles.goText}>GO!</Text>
            <Text style={styles.statusSub}>Start sprinting!</Text>
          </Animated.View>
        )}

        {phase === 'running' && (
          <>
            <Text style={styles.timerText}>{formatTime(elapsedMs)}</Text>
            <Text style={styles.timerUnit}>seconds</Text>

            <Pressable onPress={handleStop} style={styles.stopWrap}>
              <View style={styles.stopButton}>
                <SmartIcon name="stop" size={32} color={colors.textPrimary} />
                <Text style={styles.stopText}>STOP</Text>
              </View>
            </Pressable>
          </>
        )}

        {phase === 'done' && (
          <View style={styles.doneWrap}>
            <SmartIcon name="checkmark-circle" size={80} color={colors.success} />
            <Text style={styles.doneTime}>{formatTime(elapsedMs)}s</Text>
            <Text style={styles.doneLabel}>Done!</Text>
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
    backgroundColor: screenBg,
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
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
  },
  statusLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    color: colors.textInactive,
    marginTop: spacing.lg,
  },
  statusSub: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: spacing.xs,
  },
  goContainer: {
    alignItems: 'center',
  },
  goText: {
    fontFamily: fontFamily.bold,
    fontSize: 80,
    color: colors.accent,
    lineHeight: 90,
  },
  timerText: {
    fontFamily: fontFamily.bold,
    fontSize: 80,
    color: colors.accent,
    lineHeight: 90,
  },
  timerUnit: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  stopWrap: {
    marginTop: spacing.xl,
  },
  stopButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.textSecondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  stopText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 2,
  },

  // Done
  doneWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTime: {
    fontFamily: fontFamily.bold,
    fontSize: 48,
    color: colors.accent,
    marginTop: spacing.md,
  },
  doneLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.accent,
    marginTop: spacing.sm,
  },
});
