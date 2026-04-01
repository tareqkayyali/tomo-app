/**
 * Balance Stability Test Screen
 *
 * Uses Gyroscope to measure body stability while standing on one leg.
 * Flow:
 *   1. Instructions → stand on one leg
 *   2. 3s calibration → 30s test
 *   3. Real-time visual: stability ring that widens/shrinks with wobble
 *   4. Navigate to PhoneTestComplete with metrics
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Gyroscope } from 'expo-sensors';
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
  navigation: NativeStackNavigationProp<MainStackParamList, 'BalanceTest'>;
};

type Phase = 'instructions' | 'countdown' | 'calibrating' | 'active' | 'done';

const TEST_DURATION_SEC = 30;
const STEADY_THRESHOLD = 0.5; // rad/s — below this = steady
const SCREEN_WIDTH = Dimensions.get('window').width;
const RING_SIZE = SCREEN_WIDTH * 0.6;

export function BalanceTestScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [countdownNum, setCountdownNum] = useState(3);
  const [remainingSec, setRemainingSec] = useState(TEST_DURATION_SEC);
  const [currentDeviation, setCurrentDeviation] = useState(0);
  const [liveScore, setLiveScore] = useState(100);

  const subscriptionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const samplesRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const steadyCountRef = useRef(0);
  const totalCountRef = useRef(0);

  const countdownScale = useSharedValue(1);
  const ringScale = useSharedValue(1);

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
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

  // Calibrate
  const startCalibration = useCallback(async () => {
    setPhase('calibrating');

    await Gyroscope.setUpdateInterval(20);
    subscriptionRef.current = Gyroscope.addListener(() => {
      // Just let it warm up
    });

    timerRef.current = setTimeout(() => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      beginBalanceTest();
    }, 3000);
  }, []);

  // Begin the balance test
  const beginBalanceTest = useCallback(async () => {
    setPhase('active');
    startTimeRef.current = Date.now();
    samplesRef.current = [];
    steadyCountRef.current = 0;
    totalCountRef.current = 0;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Countdown timer
    setRemainingSec(TEST_DURATION_SEC);
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, TEST_DURATION_SEC - elapsed);
      setRemainingSec(remaining);

      if (remaining <= 0) {
        finishTest();
      }
    }, 500);

    // Gyroscope listener
    await Gyroscope.setUpdateInterval(20);

    subscriptionRef.current = Gyroscope.addListener(({ x, y, z }) => {
      const deviation = Math.sqrt(x * x + y * y + z * z);
      samplesRef.current.push({ x, y, z });
      totalCountRef.current++;

      if (deviation < STEADY_THRESHOLD) {
        steadyCountRef.current++;
      }

      // Update UI
      setCurrentDeviation(Math.round(deviation * 100) / 100);

      // Ring scale: 1.0 when steady, expands when wobbling
      const scale = 1 + Math.min(deviation * 0.3, 0.8);
      ringScale.value = withTiming(scale, { duration: 100 });

      // Live score (rolling average)
      const steadyPct = totalCountRef.current > 0
        ? Math.round((steadyCountRef.current / totalCountRef.current) * 100)
        : 100;
      setLiveScore(steadyPct);
    });

    // Auto-finish
    timerRef.current = setTimeout(() => {
      finishTest();
    }, TEST_DURATION_SEC * 1000 + 200);
  }, []);

  // Finish the test
  const finishTest = useCallback(() => {
    stopAll();
    setPhase('done');
    Vibration.vibrate(300);

    const samples = samplesRef.current;
    if (samples.length === 0) {
      setTimeout(() => navigation.goBack(), 1500);
      return;
    }

    // Calculate metrics
    const deviations = samples.map((s) => Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z));
    const avgDeviation = Math.round((deviations.reduce((a, b) => a + b, 0) / deviations.length) * 100) / 100;
    const maxDeviation = Math.round(Math.max(...deviations) * 100) / 100;
    const steadyPercent = totalCountRef.current > 0
      ? Math.round((steadyCountRef.current / totalCountRef.current) * 100)
      : 0;

    // Score: weighted combination
    const score = Math.round(Math.max(0, Math.min(100,
      steadyPercent * 0.5 +
      Math.max(0, 100 - avgDeviation * 50) * 0.3 +
      Math.max(0, 100 - maxDeviation * 20) * 0.2
    )));

    const totalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);

    setTimeout(() => {
      navigation.replace('PhoneTestComplete', {
        testId: 'balance-stability',
        testName: 'Balance & Stability',
        category: 'balance',
        primaryScore: score,
        unit: '/100',
        metrics: {
          stabilityScore: score,
          avgDeviation,
          maxDeviation,
          steadyPercent,
        },
        durationSeconds: totalDuration,
      });
    }, 500);
  }, [navigation, stopAll]);

  // Get ring color based on deviation
  const getRingColor = (dev: number): string => {
    if (dev < 0.3) return '#30D158';
    if (dev < 0.8) return '#FFD60A';
    if (dev < 1.5) return '#FF9500';
    return '#FF453A';
  };

  // ── Instructions ──
  if (phase === 'instructions') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.instructionsWrap}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,214,10,0.15)' }]}>
            <SmartIcon name="body-outline" size={40} color="#FFD60A" />
          </View>
          <Text style={styles.title}>Balance & Stability</Text>
          <Text style={styles.subtitle}>Test your balance by standing on one leg</Text>

          <View style={styles.stepsList}>
            {[
              'Hold phone still against your chest or waist',
              'Stand on one leg when test begins',
              'Stay as still as possible for 30 seconds',
              'Watch the ring — smaller = more stable',
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
              colors={['#FFD60A', '#FF9500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButton}
            >
              <SmartIcon name="play" size={22} color="#FFFFFF" />
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
  if (phase === 'countdown' || phase === 'calibrating') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.countdownWrap}>
          <Text style={styles.getReady}>
            {phase === 'calibrating' ? 'Calibrating...' : 'Get Ready'}
          </Text>
          {phase === 'countdown' && (
            <Animated.Text style={[styles.countdownNum, countdownAnimStyle]}>
              {countdownNum}
            </Animated.Text>
          )}
          {phase === 'calibrating' && (
            <SmartIcon name="body-outline" size={60} color={colors.textInactive} />
          )}
          <Text style={styles.holdText}>Stand on one leg now</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ringColor = getRingColor(currentDeviation);

  // ── Active / Done ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {phase === 'active' && (
        <>
          {/* Timer */}
          <View style={styles.timerRow}>
            <SmartIcon name="timer-outline" size={20} color={colors.textInactive} />
            <Text style={styles.timerText}>{remainingSec}s</Text>
          </View>

          {/* Stability Ring */}
          <View style={styles.ringContainer}>
            <Animated.View
              style={[
                styles.stabilityRing,
                ringAnimStyle,
                { borderColor: ringColor },
              ]}
            >
              <Text style={[styles.ringScore, { color: ringColor }]}>{liveScore}</Text>
              <Text style={styles.ringLabel}>stability</Text>
            </Animated.View>
          </View>

          {/* Deviation readout */}
          <View style={styles.deviationRow}>
            <Text style={styles.deviationLabel}>Wobble</Text>
            <Text style={[styles.deviationValue, { color: ringColor }]}>
              {currentDeviation} rad/s
            </Text>
          </View>
        </>
      )}

      {phase === 'done' && (
        <View style={styles.doneWrap}>
          <SmartIcon name="checkmark-circle" size={80} color="#30D158" />
          <Text style={styles.doneScore}>{liveScore}/100</Text>
          <Text style={styles.doneText}>Done!</Text>
        </View>
      )}
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
    color: '#FFD60A',
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
    color: '#FFFFFF',
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
    color: '#FFD60A',
    lineHeight: 130,
  },
  holdText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: spacing.lg,
  },

  // Active
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
  timerText: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
  },

  ringContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stabilityRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  ringScore: {
    fontFamily: fontFamily.bold,
    fontSize: 64,
    lineHeight: 72,
  },
  ringLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: -4,
  },

  deviationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  deviationLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
  },
  deviationValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },

  // Done
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneScore: {
    fontFamily: fontFamily.bold,
    fontSize: 48,
    color: '#FFD60A',
    marginTop: spacing.md,
  },
  doneText: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    color: '#30D158',
    marginTop: spacing.sm,
  },
});
