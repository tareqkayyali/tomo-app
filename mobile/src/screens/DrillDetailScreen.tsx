/**
 * Drill Detail Screen
 * Full workout flow: setup → countdown → active set → rest → repeat → complete
 *
 * Phases:
 *   setup     — show setup instructions + "Start Drill" button
 *   countdown — 3-2-1-GO
 *   active    — timer counting down for set duration
 *   rest      — rest timer between sets
 *   done      — navigate to SessionComplete
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Vibration,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  typography,
} from '../theme';
import { useBlazePodDrills, type BlazePodDrill } from '../hooks/useContentHelpers';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'DrillDetail'>;
  route: RouteProp<MainStackParamList, 'DrillDetail'>;
};

type Phase = 'setup' | 'countdown' | 'active' | 'rest' | 'done';

export function DrillDetailScreen({ navigation, route }: Props) {
  const drills = useBlazePodDrills();
  const drill = drills.find((d) => d.id === route.params.drillId) as BlazePodDrill;

  const [phase, setPhase] = useState<Phase>('setup');
  const [countdownVal, setCountdownVal] = useState(3);
  const [timeLeft, setTimeLeft] = useState(drill.setDurationSec);
  const [restLeft, setRestLeft] = useState(drill.restBetweenSetsSec);
  const [currentSet, setCurrentSet] = useState(1);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const totalElapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Countdown phase ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    setCountdownVal(3);
    const id = setInterval(() => {
      setCountdownVal((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setPhase('active');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    intervalRef.current = id;
    return () => clearInterval(id);
  }, [phase]);

  // ── Active set timer ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;
    setTimeLeft(drill.setDurationSec);
    startTimeRef.current = Date.now();

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          Vibration.vibrate(300);
          const setTime = Math.round((Date.now() - startTimeRef.current) / 1000);
          const accumulated = totalElapsedRef.current + setTime;
          totalElapsedRef.current = accumulated;
          setTotalElapsed(accumulated);
          if (currentSet >= drill.sets) {
            setPhase('done');
          } else {
            setPhase('rest');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    intervalRef.current = id;
    return () => clearInterval(id);
  }, [phase, currentSet]);

  // ── Rest timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'rest') return;
    setRestLeft(drill.restBetweenSetsSec);

    const id = setInterval(() => {
      setRestLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          Vibration.vibrate(200);
          setCurrentSet((s) => s + 1);
          setPhase('countdown');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    intervalRef.current = id;
    return () => clearInterval(id);
  }, [phase]);

  // ── Navigate to complete ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'done') return;
    // small delay so the user sees "Complete!"
    const t = setTimeout(() => {
      navigation.replace('SessionComplete', {
        drillId: drill.id,
        drillName: drill.name,
        sets: drill.sets,
        durationSeconds: totalElapsed,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [phase]);

  const handleStart = useCallback(() => {
    setPhase('countdown');
  }, []);

  const handleSkipRest = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCurrentSet((s) => s + 1);
    setPhase('countdown');
  }, []);

  const handleCancel = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('Your progress for this session will be lost. End drill?')) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        navigation.goBack();
      }
    } else {
      Alert.alert('End Drill?', 'Your progress for this session will be lost.', [
        { text: 'Continue', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            navigation.goBack();
          },
        },
      ]);
    }
  }, [navigation]);

  // ── Format time ─────────────────────────────────────────────────────
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Render by phase ─────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={[styles.iconCircle, { backgroundColor: drill.color + '18' }]}>
            <Ionicons name={drill.icon as any} size={40} color={drill.color} />
          </View>
          <Text style={styles.drillTitle}>{drill.name}</Text>
          <Text style={styles.drillMeta}>
            {drill.sets} sets x {drill.setDurationSec}s{'  '}|{'  '}
            {drill.restBetweenSetsSec}s rest
          </Text>
          <Text style={styles.drillDesc}>{drill.description}</Text>

          {/* Setup Instructions */}
          <Text style={styles.sectionTitle}>Setup</Text>
          {drill.setup.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          {/* Start Button */}
          <Pressable onPress={handleStart} style={styles.startButtonWrap}>
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButton}
            >
              <Ionicons name="play" size={24} color={colors.textPrimary} />
              <Text style={styles.startButtonText}>Start Drill</Text>
            </LinearGradient>
          </Pressable>

          {/* Record Button */}
          <Pressable
            onPress={() =>
              navigation.navigate('DrillCamera', {
                drillId: drill.id,
                drillName: drill.name,
              })
            }
            style={styles.recordButtonWrap}
          >
            <Ionicons name="videocam-outline" size={20} color={colors.accent1} />
            <Text style={styles.recordButtonLabel}>Record Yourself</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'countdown') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.countdownNum}>
          {countdownVal === 0 ? 'GO!' : countdownVal}
        </Text>
        <Text style={styles.countdownLabel}>Get Ready — Set {currentSet}</Text>
      </View>
    );
  }

  if (phase === 'active') {
    const progress = 1 - timeLeft / drill.setDurationSec;
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.phaseLabel}>SET {currentSet} / {drill.sets}</Text>
        <Text style={[styles.bigTimer, { color: drill.color }]}>{fmt(timeLeft)}</Text>
        {/* progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: drill.color }]} />
        </View>
        <Text style={styles.phaseHint}>Tap pods as they light up!</Text>

        <Pressable style={styles.cancelBtn} onPress={handleCancel}>
          <Ionicons name="stop-circle-outline" size={20} color={colors.textInactive} />
          <Text style={styles.cancelText}>End Drill</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'rest') {
    return (
      <View style={styles.fullCenter}>
        <Ionicons name="pause-circle-outline" size={48} color={colors.textInactive} />
        <Text style={styles.restLabel}>Rest</Text>
        <Text style={styles.bigTimer}>{fmt(restLeft)}</Text>
        <Text style={styles.phaseHint}>
          Next: Set {currentSet + 1} / {drill.sets}
        </Text>

        <Pressable style={styles.skipBtn} onPress={handleSkipRest}>
          <Text style={styles.skipText}>Skip Rest</Text>
        </Pressable>
      </View>
    );
  }

  // phase === 'done'
  return (
    <View style={styles.fullCenter}>
      <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
      <Text style={styles.doneText}>Complete!</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.xl,
    paddingBottom: spacing.huge,
    alignItems: 'center',
  },

  // ── Setup phase ─────────────────────────────────────────────────────
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  drillTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  drillMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.md,
  },
  drillDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textInactive,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.accent1,
  },
  stepText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textInactive,
    lineHeight: 22,
  },
  startButtonWrap: {
    marginTop: spacing.xl,
    width: '100%',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
  },
  startButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  recordButtonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent1 + '40',
  },
  recordButtonLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.accent1,
  },

  // ── Timer phases ────────────────────────────────────────────────────
  fullCenter: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
  },
  phaseLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textInactive,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  bigTimer: {
    fontFamily: fontFamily.bold,
    fontSize: 72,
    color: colors.textOnDark,
    marginBottom: spacing.lg,
  },
  progressTrack: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundElevated,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  phaseHint: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'absolute',
    bottom: 60,
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
  },

  // ── Rest phase ──────────────────────────────────────────────────────
  restLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    color: colors.textInactive,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  skipBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundElevated,
    marginTop: spacing.xl,
  },
  skipText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.accent1,
  },

  // ── Countdown ───────────────────────────────────────────────────────
  countdownNum: {
    fontFamily: fontFamily.bold,
    fontSize: 96,
    color: colors.accent1,
  },
  countdownLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.textInactive,
    marginTop: spacing.md,
  },

  // ── Done ────────────────────────────────────────────────────────────
  doneText: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.accent,
    marginTop: spacing.md,
  },
});
