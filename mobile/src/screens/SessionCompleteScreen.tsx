/**
 * Session Complete Screen
 * After a BlazePod drill, user enters manual metrics:
 *   - Total touches
 *   - Best reaction time (ms)
 *   - Average reaction time (ms)
 *   - RPE (1-10)
 *   - Optional notes
 *
 * Then saves to backend and shows success.
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
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../components';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  typography,
} from '../theme';
import { saveBlazePodSession } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'SessionComplete'>;
  route: RouteProp<MainStackParamList, 'SessionComplete'>;
};

const RPE_LABELS: Record<number, string> = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Light',
  4: 'Moderate',
  5: 'Somewhat Hard',
  6: 'Hard',
  7: 'Very Hard',
  8: 'Extremely Hard',
  9: 'Near Max',
  10: 'Max Effort',
};

export function SessionCompleteScreen({ navigation, route }: Props) {
  const { drillId, drillName, sets, durationSeconds } = route.params;

  const [touches, setTouches] = useState('');
  const [bestReaction, setBestReaction] = useState('');
  const [avgReaction, setAvgReaction] = useState('');
  const [rpe, setRpe] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    const touchNum = parseInt(touches, 10);
    if (!touches || isNaN(touchNum) || touchNum < 0) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a valid number of touches.');
      } else {
        Alert.alert('Invalid Input', 'Please enter a valid number of touches.');
      }
      return;
    }

    const bestMs = bestReaction ? parseFloat(bestReaction) : null;
    const avgMs = avgReaction ? parseFloat(avgReaction) : null;

    if (bestReaction && (bestMs === null || isNaN(bestMs) || bestMs < 0)) {
      if (Platform.OS === 'web') {
        window.alert('Best reaction time must be a positive number (ms).');
      } else {
        Alert.alert('Invalid Input', 'Best reaction time must be a positive number (ms).');
      }
      return;
    }
    if (avgReaction && (avgMs === null || isNaN(avgMs) || avgMs < 0)) {
      if (Platform.OS === 'web') {
        window.alert('Average reaction time must be a positive number (ms).');
      } else {
        Alert.alert('Invalid Input', 'Average reaction time must be a positive number (ms).');
      }
      return;
    }

    setSaving(true);
    try {
      await saveBlazePodSession({
        drillId,
        drillName,
        sets,
        totalTouches: touchNum,
        bestReactionTime: bestMs,
        avgReactionTime: avgMs,
        rpe,
        durationSeconds,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not save session. Please try again.');
      } else {
        Alert.alert('Error', 'Could not save session. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [touches, bestReaction, avgReaction, rpe, notes, drillId, drillName, sets, durationSeconds]);

  if (saved) {
    return (
      <View style={styles.successCenter}>
        <SmartIcon name="checkmark-circle" size={80} color={colors.accent} />
        <Text style={styles.successTitle}>Session Saved!</Text>
        <Text style={styles.successSub}>{drillName}</Text>
        <Text style={styles.successMeta}>
          {sets} sets{'  '}|{'  '}{Math.floor(durationSeconds / 60)}m {durationSeconds % 60}s
        </Text>

        <Button
          title="Back to Drills"
          onPress={() => navigation.popToTop()}
          variant="primary"
          style={styles.doneButton}
        />
      </View>
    );
  }

  const fmtDuration = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;

  return (
    <PlayerScreen
      label="SESSION"
      title="Complete"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
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
          {/* Summary header */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{drillName}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <SmartIcon name="layers-outline" size={18} color={colors.accent1} />
                <Text style={styles.summaryVal}>{sets} sets</Text>
              </View>
              <View style={styles.summaryItem}>
                <SmartIcon name="timer-outline" size={18} color={colors.accent2} />
                <Text style={styles.summaryVal}>{fmtDuration}</Text>
              </View>
            </View>
          </View>

          {/* Metric Inputs */}
          <Text style={styles.sectionTitle}>Enter Your Metrics</Text>

          <MetricInput
            label="Total Touches"
            value={touches}
            onChangeText={setTouches}
            placeholder="e.g. 24"
            keyboardType="number-pad"
            icon="hand-left-outline"
            required
          />

          <MetricInput
            label="Best Reaction Time (ms)"
            value={bestReaction}
            onChangeText={setBestReaction}
            placeholder="e.g. 320"
            keyboardType="decimal-pad"
            icon="flash-outline"
          />

          <MetricInput
            label="Avg Reaction Time (ms)"
            value={avgReaction}
            onChangeText={setAvgReaction}
            placeholder="e.g. 450"
            keyboardType="decimal-pad"
            icon="speedometer-outline"
          />

          {/* RPE Slider */}
          <Text style={styles.inputLabel}>RPE (Rate of Perceived Exertion)</Text>
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

          {/* Notes */}
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

          {/* Save */}
          <Pressable onPress={handleSave} disabled={saving} style={styles.saveWrap}>
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
            >
              <SmartIcon name="save-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : 'Save Session'}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Skip */}
          <Pressable onPress={() => navigation.popToTop()} style={styles.skipWrap}>
            <Text style={styles.skipText}>Skip — Don't Save</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </PlayerScreen>
  );
}

// ── Metric Input ──────────────────────────────────────────────────────

function MetricInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  icon,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: 'number-pad' | 'decimal-pad';
  icon: keyof typeof Ionicons.glyphMap;
  required?: boolean;
}) {
  return (
    <View style={styles.metricWrap}>
      <Text style={styles.inputLabel}>
        {label}
        {required && <Text style={{ color: colors.accent1 }}> *</Text>}
      </Text>
      <View style={styles.inputRow}>
        <SmartIcon name={icon} size={18} color={colors.textInactive} />
        <TextInput
          style={styles.metricInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textInactive}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

function getRpeColor(val: number): string {
  if (val <= 3) return colors.accent;
  if (val <= 5) return colors.warning;
  if (val <= 7) return colors.warning;
  return colors.error;
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
  },

  // ── Summary card ────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  summaryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textOnLight,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryVal: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },

  // ── Section ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    marginBottom: spacing.lg,
  },

  // ── Inputs ──────────────────────────────────────────────────────────
  metricWrap: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  metricInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textOnLight,
    paddingVertical: spacing.sm,
  },

  // ── RPE ─────────────────────────────────────────────────────────────
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
    color: colors.textPrimary,
    fontFamily: fontFamily.bold,
  },
  rpeLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // ── Notes ───────────────────────────────────────────────────────────
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

  // ── Save ────────────────────────────────────────────────────────────
  saveWrap: {
    marginBottom: spacing.md,
  },
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
    color: colors.textPrimary,
  },
  skipWrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },

  // ── Success ─────────────────────────────────────────────────────────
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
    color: colors.accent,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  successSub: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  successMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  doneButton: {
    minWidth: 200,
  },
});
