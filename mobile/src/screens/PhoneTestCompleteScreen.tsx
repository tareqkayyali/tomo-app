/**
 * Phone Test Complete Screen
 * Shared results/save screen for all phone-based tests.
 *
 * Scores come pre-calculated from the test screen (via route params).
 * User only enters RPE and optional notes.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../components';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import { savePhoneTestSession } from '../services/api';
import { PHONE_TESTS } from '../types/phoneTests';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'PhoneTestComplete'>;
  route: RouteProp<MainStackParamList, 'PhoneTestComplete'>;
};

const RPE_LABELS: Record<number, string> = {
  1: 'Very Easy', 2: 'Easy', 3: 'Light', 4: 'Moderate', 5: 'Somewhat Hard',
  6: 'Hard', 7: 'Very Hard', 8: 'Extremely Hard', 9: 'Near Max', 10: 'Max Effort',
};

function getRpeColor(val: number): string {
  if (val <= 3) return '#2ECC71';
  if (val <= 5) return '#FFD60A';
  if (val <= 7) return '#FF9500';
  return '#FF453A';
}

const METRIC_LABELS: Record<string, string> = {
  avgReactionMs: 'Avg Reaction',
  bestReactionMs: 'Best Reaction',
  worstReactionMs: 'Worst Reaction',
  consistency: 'Consistency',
  targetsHit: 'Targets Hit',
  bestJumpCm: 'Best Jump',
  avgJumpCm: 'Avg Jump',
  hangTimeMs: 'Hang Time',
  peakAccelG: 'Peak Accel',
  sprintTimeSec: 'Sprint Time',
  avgAccelG: 'Avg Accel',
  movementQuality: 'Movement Quality',
  totalShuffles: 'Total Shuffles',
  stabilityScore: 'Stability',
  avgDeviation: 'Avg Wobble',
  maxDeviation: 'Max Wobble',
  steadyPercent: 'Steady Time',
};

const METRIC_UNITS: Record<string, string> = {
  avgReactionMs: 'ms',
  bestReactionMs: 'ms',
  worstReactionMs: 'ms',
  consistency: '%',
  targetsHit: '',
  bestJumpCm: 'cm',
  avgJumpCm: 'cm',
  hangTimeMs: 'ms',
  peakAccelG: 'g',
  sprintTimeSec: 's',
  avgAccelG: 'g',
  movementQuality: '/100',
  totalShuffles: '',
  stabilityScore: '/100',
  avgDeviation: 'rad/s',
  maxDeviation: 'rad/s',
  steadyPercent: '%',
};

export function PhoneTestCompleteScreen({ navigation, route }: Props) {
  const { testId, testName, category, primaryScore, unit, metrics, durationSeconds } = route.params;

  const [rpe, setRpe] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const testDef = PHONE_TESTS.find((t) => t.id === testId);
  const testColor = testDef?.color || colors.accent1;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await savePhoneTestSession({
        testId,
        testName,
        category,
        primaryScore,
        unit,
        metrics,
        durationSeconds,
        rpe,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
    } catch {
      Alert.alert('Error', 'Could not save results. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [testId, testName, category, primaryScore, unit, metrics, durationSeconds, rpe, notes]);

  // ── Success State ──
  if (saved) {
    return (
      <View style={styles.successCenter}>
        <Ionicons name="checkmark-circle" size={80} color="#2ECC71" />
        <Text style={styles.successTitle}>Results Saved!</Text>
        <Text style={styles.successSub}>{testName}</Text>
        <Text style={styles.successScore}>
          {primaryScore} {unit}
        </Text>

        <Button
          title="Back to Tests"
          onPress={() => navigation.popToTop()}
          variant="primary"
          style={styles.doneButton}
        />
      </View>
    );
  }

  const fmtDuration = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Primary Score Card ── */}
          <View style={[styles.scoreCard, { borderColor: testColor }]}>
            <Text style={styles.scoreLabel}>{testName}</Text>
            <Text style={[styles.scoreValue, { color: testColor }]}>
              {primaryScore}
            </Text>
            <Text style={styles.scoreUnit}>{unit}</Text>
            <Text style={styles.scoreDuration}>{fmtDuration} total</Text>
          </View>

          {/* ── Metrics Breakdown ── */}
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <View style={styles.metricsGrid}>
            {Object.entries(metrics).map(([key, value]) => (
              <View key={key} style={styles.metricItem}>
                <Text style={styles.metricValue}>
                  {typeof value === 'number' ? value : String(value)}
                  <Text style={styles.metricUnit}> {METRIC_UNITS[key] || ''}</Text>
                </Text>
                <Text style={styles.metricLabel}>{METRIC_LABELS[key] || key}</Text>
              </View>
            ))}
          </View>

          {/* ── RPE ── */}
          <Text style={styles.inputLabel}>How hard was it?</Text>
          <View style={styles.rpeRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
              <Pressable
                key={val}
                onPress={() => setRpe(val)}
                style={[
                  styles.rpeDot,
                  val === rpe && styles.rpeDotActive,
                  val === rpe && { backgroundColor: getRpeColor(val) },
                ]}
              >
                <Text
                  style={[
                    styles.rpeDotText,
                    val === rpe && styles.rpeDotTextActive,
                  ]}
                >
                  {val}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.rpeLabel}>{RPE_LABELS[rpe]}</Text>

          {/* ── Notes ── */}
          <Text style={styles.inputLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="How did it feel?"
            placeholderTextColor={colors.textInactive}
            multiline
            numberOfLines={3}
          />

          {/* ── Save ── */}
          <Pressable onPress={handleSave} disabled={saving} style={styles.saveWrap}>
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
            >
              <Ionicons name="save-outline" size={20} color="#FFFFFF" />
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : 'Save Results'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => navigation.popToTop()} style={styles.skipWrap}>
            <Text style={styles.skipText}>Skip — Don't Save</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: 120,
  },

  // ── Score Card ──
  scoreCard: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  scoreLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  scoreValue: {
    fontFamily: fontFamily.bold,
    fontSize: 72,
    lineHeight: 80,
  },
  scoreUnit: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    color: colors.textInactive,
    marginTop: -4,
  },
  scoreDuration: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // ── Metrics ──
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    marginBottom: spacing.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  metricItem: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minWidth: '47%',
    flex: 1,
  },
  metricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textOnDark,
  },
  metricUnit: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
  },
  metricLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    marginTop: 2,
  },

  // ── RPE ──
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  rpeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  rpeDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeDotActive: {
    transform: [{ scale: 1.15 }],
  },
  rpeDotText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
  },
  rpeDotTextActive: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bold,
  },
  rpeLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // ── Notes ──
  notesInput: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textOnLight,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.xl,
  },

  // ── Save ──
  saveWrap: { marginBottom: spacing.md },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
  },
  saveText: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: '#FFFFFF',
  },
  skipWrap: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },

  // ── Success ──
  successCenter: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
  },
  successTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: '#2ECC71',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  successSub: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  successScore: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    color: colors.accent1,
    marginBottom: spacing.xl,
  },
  doneButton: {
    minWidth: 200,
  },
});
