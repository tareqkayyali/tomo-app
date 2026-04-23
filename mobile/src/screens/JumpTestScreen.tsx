/**
 * Jump Height Test Screen
 *
 * Uses DeviceMotion to detect freefall + landing.
 * Flow:
 *   1. Instructions → hold phone to chest
 *   2. 3s calibration → "JUMP!"
 *   3. Detect takeoff (freefall) → landing (spike)
 *   4. Formula: h = 0.5 * g * (hangTime/2)^2
 *   5. Allow 3 jumps, take best → navigate to PhoneTestComplete
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
import { DeviceMotion } from 'expo-sensors';
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
  screenBg,
} from '../theme';
import { estimateJumpHeight } from '../services/sensorTests';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'JumpTest'>;
};

type Phase = 'instructions' | 'countdown' | 'calibrating' | 'ready' | 'jumping' | 'result' | 'done';

const MAX_JUMPS = 3;
const CALIBRATION_MS = 3000;
const FREEFALL_THRESHOLD = 3.0;   // m/s² — below this = freefall
const LANDING_THRESHOLD = 15.0;    // m/s² — above this = landed

interface JumpData {
  heightCm: number;
  hangTimeMs: number;
  peakAccelG: number;
}

export function JumpTestScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [countdownNum, setCountdownNum] = useState(3);
  const [jumpNumber, setJumpNumber] = useState(0);
  const [jumps, setJumps] = useState<JumpData[]>([]);
  const [currentJumpHeight, setCurrentJumpHeight] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');

  const subscriptionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const samplesRef = useRef<Array<{ timestamp: number; x: number; y: number; z: number }>>([]);
  const calibrationRef = useRef<number>(9.81);
  const isFreefallRef = useRef(false);
  const freefallStartRef = useRef<number>(0);
  const peakAccelRef = useRef<number>(0);

  const countdownScale = useSharedValue(1);
  const resultScale = useSharedValue(0);

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  const resultAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: resultScale.value }],
    opacity: resultScale.value,
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
        startCalibration();
        return;
      }
      setCountdownNum(count);
      count--;
      timerRef.current = setTimeout(tick, 1000);
    };
    tick();
  }, []);

  // Calibration: measure resting acceleration for 3 seconds
  const startCalibration = useCallback(async () => {
    setPhase('calibrating');
    setStatusText('Hold still... calibrating');
    samplesRef.current = [];

    await DeviceMotion.setUpdateInterval(20); // 50Hz

    const calSamples: number[] = [];
    subscriptionRef.current = DeviceMotion.addListener((data) => {
      if (data.acceleration) {
        const mag = Math.sqrt(
          data.acceleration.x ** 2 +
          data.acceleration.y ** 2 +
          data.acceleration.z ** 2
        );
        calSamples.push(mag);
      }
    });

    timerRef.current = setTimeout(() => {
      stopSensor();

      // Average resting magnitude (should be ~0 for acceleration-without-gravity, or ~9.81 with gravity)
      if (calSamples.length > 0) {
        calibrationRef.current = calSamples.reduce((a, b) => a + b, 0) / calSamples.length;
      }

      beginJump();
    }, CALIBRATION_MS);
  }, []);

  // Begin listening for a jump
  const beginJump = useCallback(async () => {
    const jumpNum = jumpNumber + 1;
    setJumpNumber(jumpNum);
    setPhase('ready');
    setStatusText(`Jump ${jumpNum}/${MAX_JUMPS} — JUMP NOW!`);
    isFreefallRef.current = false;
    peakAccelRef.current = 0;
    samplesRef.current = [];
    startTimeRef.current = Date.now();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await DeviceMotion.setUpdateInterval(10); // 100Hz for better accuracy

    subscriptionRef.current = DeviceMotion.addListener((data) => {
      if (!data.acceleration) return;

      const { x, y, z } = data.acceleration;
      const mag = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
      const timestamp = Date.now();

      samplesRef.current.push({ timestamp, x, y, z });

      // Track peak acceleration
      if (mag > peakAccelRef.current) {
        peakAccelRef.current = mag;
      }

      // Detect freefall (low acceleration = in the air)
      if (!isFreefallRef.current && mag < FREEFALL_THRESHOLD) {
        isFreefallRef.current = true;
        freefallStartRef.current = timestamp;
        setPhase('jumping');
        setStatusText('In the air!');
      }

      // Detect landing (high spike after freefall)
      if (isFreefallRef.current && mag > LANDING_THRESHOLD) {
        const hangTimeMs = timestamp - freefallStartRef.current;

        // Only count jumps with reasonable hang time (50ms - 1500ms)
        if (hangTimeMs > 50 && hangTimeMs < 1500) {
          stopSensor();
          processJump(hangTimeMs, jumpNum);
        } else {
          // Reset - false positive
          isFreefallRef.current = false;
        }
      }
    });

    // Auto-stop after 10 seconds if no jump detected
    timerRef.current = setTimeout(() => {
      stopSensor();
      setStatusText('No jump detected. Try again.');
      setPhase('result');
      setCurrentJumpHeight(null);

      timerRef.current = setTimeout(() => {
        if (jumpNum < MAX_JUMPS) {
          beginJump();
        } else {
          finishTest();
        }
      }, 2000);
    }, 10000);
  }, [jumpNumber, stopSensor]);

  // Process a detected jump
  const processJump = useCallback((hangTimeMs: number, jumpNum: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Use our sensor calculation
    const result = estimateJumpHeight(samplesRef.current, false);
    // But also use direct hang time formula as backup
    const hangTimeSec = hangTimeMs / 1000;
    const heightM = 0.5 * 9.81 * (hangTimeSec / 2) ** 2;
    const sensorHeight = result ? result.estimatedHeightCm : 0;
    const heightCm = Math.round(Math.max(sensorHeight, heightM * 100));

    const jumpData: JumpData = {
      heightCm,
      hangTimeMs,
      peakAccelG: Math.round(peakAccelRef.current / 9.81 * 10) / 10,
    };

    const newJumps = [...jumps, jumpData];
    setJumps(newJumps);
    setCurrentJumpHeight(heightCm);
    setPhase('result');
    setStatusText(`${heightCm} cm`);

    resultScale.value = 0;
    resultScale.value = withSpring(1, { damping: 8, stiffness: 200 });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // After showing result, move to next jump or finish
    timerRef.current = setTimeout(() => {
      if (jumpNum < MAX_JUMPS) {
        setCurrentJumpHeight(null);
        beginJump();
      } else {
        finishTest(newJumps);
      }
    }, 2500);
  }, [jumps]);

  // Finish the test
  const finishTest = useCallback((allJumps?: JumpData[]) => {
    const finalJumps = allJumps || jumps;
    setPhase('done');
    Vibration.vibrate(300);

    if (finalJumps.length === 0) {
      navigation.goBack();
      return;
    }

    const bestJump = Math.max(...finalJumps.map((j) => j.heightCm));
    const avgJump = Math.round(finalJumps.reduce((a, j) => a + j.heightCm, 0) / finalJumps.length);
    const bestHangTime = Math.max(...finalJumps.map((j) => j.hangTimeMs));
    const peakAccel = Math.max(...finalJumps.map((j) => j.peakAccelG));
    const totalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);

    setTimeout(() => {
      navigation.replace('PhoneTestComplete', {
        testId: 'jump-height',
        testName: 'Jump Height',
        category: 'power',
        primaryScore: bestJump,
        unit: 'cm',
        metrics: {
          bestJumpCm: bestJump,
          avgJumpCm: avgJump,
          hangTimeMs: bestHangTime,
          peakAccelG: peakAccel,
        },
        durationSeconds: totalDuration,
      });
    }, 500);
  }, [jumps, navigation]);

  // ── Instructions ──
  if (phase === 'instructions') {
    return (
      <PlayerScreen label="TEST" title="Jump" onBack={() => navigation.goBack()}>
        <View style={styles.instructionsWrap}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(123,97,255,0.15)' }]}>
            <SmartIcon name="arrow-up-outline" size={40} color={colors.textSecondary} />
          </View>
          <Text style={styles.title}>Jump Height</Text>
          <Text style={styles.subtitle}>Measure your vertical jump using phone sensors</Text>

          <View style={styles.stepsList}>
            {[
              'Hold phone firmly against your chest',
              'Stand still for 3-second calibration',
              `Jump as high as you can (${MAX_JUMPS} attempts)`,
              'Land on both feet — sensor detects impact',
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
              colors={[colors.textSecondary, colors.textSecondary]}
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
          <Text style={styles.holdText}>Hold phone to your chest</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Active / Result / Done ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Jump counter */}
      <View style={styles.jumpCounter}>
        {Array.from({ length: MAX_JUMPS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.jumpDot,
              i < jumps.length && styles.jumpDotDone,
              i === jumpNumber - 1 && phase !== 'result' && phase !== 'done' && styles.jumpDotActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.centerContent}>
        {phase === 'calibrating' && (
          <>
            <SmartIcon name="body-outline" size={60} color={colors.textInactive} />
            <Text style={styles.statusLabel}>Calibrating...</Text>
            <Text style={styles.statusSub}>Hold perfectly still</Text>
          </>
        )}

        {(phase === 'ready' || phase === 'jumping') && (
          <>
            <SmartIcon
              name={phase === 'jumping' ? 'rocket-outline' : 'fitness-outline'}
              size={80}
              color={colors.textSecondary}
            />
            <Text style={styles.jumpNow}>
              {phase === 'jumping' ? 'In the air!' : 'JUMP!'}
            </Text>
            <Text style={styles.statusSub}>
              Jump {jumpNumber} of {MAX_JUMPS}
            </Text>
          </>
        )}

        {phase === 'result' && currentJumpHeight !== null && (
          <Animated.View style={[styles.resultCard, resultAnimStyle]}>
            <Text style={styles.resultHeight}>{currentJumpHeight}</Text>
            <Text style={styles.resultUnit}>cm</Text>
            <Text style={styles.resultJump}>Jump {jumpNumber}</Text>
          </Animated.View>
        )}

        {phase === 'result' && currentJumpHeight === null && (
          <View style={styles.resultCard}>
            <SmartIcon name="refresh-outline" size={40} color={colors.textInactive} />
            <Text style={styles.statusSub}>No jump detected</Text>
            <Text style={styles.statusSub}>Trying again...</Text>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.doneWrap}>
            <SmartIcon name="checkmark-circle" size={80} color={colors.success} />
            <Text style={styles.doneText}>Done!</Text>
          </View>
        )}
      </View>

      {/* Jump results so far */}
      {jumps.length > 0 && phase !== 'done' && (
        <View style={styles.jumpResults}>
          {jumps.map((j, i) => (
            <View key={i} style={styles.jumpResultItem}>
              <Text style={styles.jumpResultLabel}>Jump {i + 1}</Text>
              <Text style={styles.jumpResultValue}>{j.heightCm} cm</Text>
            </View>
          ))}
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
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    lineHeight: 130,
  },
  holdText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: spacing.lg,
  },

  // Active
  jumpCounter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  jumpDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.creamSoft,
  },
  jumpDotActive: {
    backgroundColor: colors.textSecondary,
    transform: [{ scale: 1.3 }],
  },
  jumpDotDone: {
    backgroundColor: colors.accent,
  },

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
  jumpNow: {
    fontFamily: fontFamily.bold,
    fontSize: 48,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },

  // Result
  resultCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeight: {
    fontFamily: fontFamily.bold,
    fontSize: 96,
    color: colors.textSecondary,
    lineHeight: 100,
  },
  resultUnit: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    color: colors.textInactive,
    marginTop: -8,
  },
  resultJump: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: spacing.sm,
  },

  // Jump results bar
  jumpResults: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: layout.screenMargin,
  },
  jumpResultItem: {
    alignItems: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  jumpResultLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
  },
  jumpResultValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textSecondary,
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
