/**
 * PHVCalculatorScreen — Form to calculate Peak Height Velocity maturity offset
 *
 * Reads sex and age from profile. Collects standing height, sitting height, and weight.
 * Saves result via event ingestion endpoint.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import {
  spacing,
  fontFamily,
  borderRadius,
  layout,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';
import {
  calculatePHV,
  validatePHVInputs,
  type PHVResult,
  type Sex,
  type PHVInputs,
} from '../utils/phvCalculator';
import { submitEventSafe } from '../services/api';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Category display helpers ──────────────────────────────────────────

const CATEGORY_DISPLAY: Record<string, { label: string; color: string; emoji: string }> = {
  'pre-phv-early': { label: 'Pre-PHV (Early)', color: colors.info, emoji: '\u{1F331}' },
  'pre-phv-approaching': { label: 'Pre-PHV (Approaching)', color: colors.info, emoji: '\u{1F4C8}' },
  'at-phv': { label: 'At PHV', color: colors.accent, emoji: '\u{26A1}' },
  'post-phv-recent': { label: 'Post-PHV (Recent)', color: colors.accent, emoji: '\u{1F4AA}' },
  'post-phv-stable': { label: 'Post-PHV (Stable)', color: colors.accent, emoji: '\u{1F3AF}' },
};

export function PHVCalculatorScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = (require('@react-navigation/native') as any).useRoute();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Existing PHV data passed from Output screen for recalculation
  const existingOffset = route.params?.existingOffset;
  const existingStage = route.params?.existingStage;

  // ── Derive sex from profile gender ──────────────────────────────
  const profileSex: Sex | null = (() => {
    if (profile?.gender === 'male') return 'male';
    if (profile?.gender === 'female') return 'female';
    return null;
  })();

  // ── Pre-fill from route params OR profile data ─────────────────
  const paramStandingHeight = route.params?.standingHeight;
  const paramSittingHeight = route.params?.sittingHeight;
  const paramWeight = route.params?.weight;

  // Use route params first, then fall back to profile height/weight
  const initialHeight = paramStandingHeight || (profile as any)?.height_cm || (profile as any)?.height || '';
  const initialSitting = paramSittingHeight || '';
  const initialWeight = paramWeight || (profile as any)?.weight_kg || (profile as any)?.weight || '';
  const initialDob = (profile as any)?.dateOfBirth || (profile as any)?.date_of_birth || (profile as any)?.dob || '';

  // ── Form state ──────────────────────────────────────────────────
  const [standingHeight, setStandingHeight] = useState(initialHeight ? String(initialHeight) : '');
  const [sittingHeight, setSittingHeight] = useState(initialSitting ? String(initialSitting) : '');
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : '');
  const [sex, setSex] = useState<Sex | null>(profileSex);
  const [dob, setDob] = useState(initialDob);

  // Sync sex/dob from profile when it updates (e.g. after refreshProfile)
  useEffect(() => {
    if (profileSex && !sex) setSex(profileSex);
  }, [profileSex]);
  useEffect(() => {
    if (initialDob && !dob) {
      setDob(initialDob);
      const parsed = new Date(initialDob);
      if (!isNaN(parsed.getTime())) setDobDate(parsed);
    }
  }, [initialDob]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dobDate, setDobDate] = useState<Date>(() => {
    if (dob) {
      const parsed = new Date(dob);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date(2008, 0, 1);
  });
  const [result, setResult] = useState<PHVResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Age from profile DOB or age field
  const ageDecimal = profile?.age ?? null;

  // ── Fetch PHV measurements from snapshot on mount (only what's missing) ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { getOutputSnapshot } = require('../services/api');
        const snapshot = await getOutputSnapshot();
        if (!mounted) return;

        const phv = snapshot?.vitals?.phv;
        if (phv) {
          if (phv.standingHeightCm) setStandingHeight(String(phv.standingHeightCm));
          if (phv.sittingHeightCm) setSittingHeight(String(phv.sittingHeightCm));
          if (phv.weightKg) setWeight(String(phv.weightKg));
          if (phv.sex && (phv.sex === 'male' || phv.sex === 'female')) setSex(phv.sex);
          if (phv.dateOfBirth) {
            setDob(phv.dateOfBirth);
            const parsed = new Date(phv.dateOfBirth);
            if (!isNaN(parsed.getTime())) setDobDate(parsed);
          }
        }
      } catch (e) {
        console.warn('[PHVCalculator] Failed to fetch snapshot:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Date picker handler ───────────────────────────────────────
  const onDateChange = useCallback((event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDobDate(selectedDate);
      const iso = selectedDate.toISOString().split('T')[0];
      setDob(iso);
    }
  }, []);

  // ── Calculate ───────────────────────────────────────────────────
  const showAlert = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const handleCalculate = useCallback(() => {
    if (!sex) {
      showAlert('Missing Info', 'Please select your sex to calculate PHV.');
      return;
    }
    if (ageDecimal == null || ageDecimal < 10 || ageDecimal > 20) {
      showAlert('Age Issue', 'PHV calculation requires age between 10 and 20. Please update your profile.');
      return;
    }

    const standingCm = parseFloat(standingHeight);
    const sittingCm = parseFloat(sittingHeight);
    const weightKg = parseFloat(weight);

    if (isNaN(standingCm) || isNaN(sittingCm) || isNaN(weightKg)) {
      showAlert('Missing Fields', 'Please fill in all measurements.');
      return;
    }

    const inputs: PHVInputs = {
      sex,
      ageDecimal,
      standingHeightCm: standingCm,
      sittingHeightCm: sittingCm,
      weightKg,
    };

    const errors = validatePHVInputs(inputs);
    if (errors.length > 0) {
      showAlert('Validation Error', errors.join('\n'));
      return;
    }

    const phvResult = calculatePHV(inputs);
    setResult(phvResult);
  }, [sex, ageDecimal, standingHeight, sittingHeight, weight, showAlert]);

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      // Direct synchronous save — bypasses async event pipeline
      const { apiRequest } = require('../services/api');
      await apiRequest('/api/v1/user/phv', {
        method: 'POST',
        body: JSON.stringify({
          standing_height_cm: parseFloat(standingHeight),
          sitting_height_cm: parseFloat(sittingHeight),
          weight_kg: parseFloat(weight),
          maturity_offset: result.maturityOffset,
          phv_stage: result.maturityCategory,
          date_of_birth: dob,
          sex: sex,
          age_decimal: ageDecimal,
        }),
      });

      // Refresh auth profile so DOB/gender are available instantly next time
      try { await refreshProfile(); } catch {}

      setSavedMessage('✅ Growth stage saved!');
      setTimeout(() => {
        if (Platform.OS === 'web' && window.history.length > 1) {
          window.history.back();
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          (navigation as any).navigate('MainTabs');
        }
      }, 1500);
    } catch (e) {
      setSavedMessage('❌ Failed to save. Please try again.');
      setSaving(false);
    }
  }, [result, user, standingHeight, sittingHeight, weight, dob, sex, navigation]);

  const handleRecalculate = useCallback(() => {
    setResult(null);
    setSavedMessage('');
  }, []);

  // ── Render ──────────────────────────────────────────────────────
  const categoryInfo = result ? CATEGORY_DISPLAY[result.maturityCategory] : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => {
          if (Platform.OS === 'web' && window.history.length > 1) {
            window.history.back();
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            (navigation as any).navigate('MainTabs');
          }
        }} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Calculate Your Growth Stage</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info */}
          <Text style={styles.infoText}>
            This helps Tomo customize your training for your body's development stage.
          </Text>

          {/* Sex selector — always show, allow changing */}
          <View style={styles.sexRow}>
            <Text style={styles.fieldLabel}>Sex</Text>
            <View style={styles.sexButtons}>
              <TouchableOpacity
                style={[styles.sexButton, sex === 'male' && { backgroundColor: colors.accent1 + '30' }]}
                onPress={() => setSex('male')}
                activeOpacity={0.7}
              >
                <Text style={[styles.sexButtonText, { color: sex === 'male' ? colors.accent1 : colors.textInactive }]}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sexButton, sex === 'female' && { backgroundColor: colors.accent1 + '30' }]}
                onPress={() => setSex('female')}
                activeOpacity={0.7}
              >
                <Text style={[styles.sexButtonText, { color: sex === 'female' ? colors.accent1 : colors.textInactive }]}>Female</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* DOB display */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Date of Birth</Text>
            {Platform.OS === 'web' ? (
              <Pressable
                onPress={() => {
                  const input = document.getElementById('phv-dob-input') as HTMLInputElement;
                  if (input) input.showPicker?.();
                }}
                style={[styles.datePickerButton, { backgroundColor: colors.inputBackground }]}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.accent1} />
                <Text style={[styles.datePickerText, { color: dob ? colors.textOnDark : colors.textMuted }]}>
                  {dob || 'Select your date of birth'}
                </Text>
                {/* Hidden native date input for web */}
                <input
                  id="phv-dob-input"
                  type="date"
                  value={dob}
                  max={new Date().toISOString().split('T')[0]}
                  min="2004-01-01"
                  onChange={(e: any) => {
                    const val = e.target.value;
                    if (val) {
                      setDob(val);
                      setDobDate(new Date(val));
                    }
                  }}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    top: 0,
                    left: 0,
                    cursor: 'pointer',
                  } as any}
                />
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={[styles.datePickerButton, { backgroundColor: colors.inputBackground }]}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.accent1} />
                  <Text style={[styles.datePickerText, { color: dob ? colors.textOnDark : colors.textMuted }]}>
                    {dob || 'Select your date of birth'}
                  </Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={dobDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    minimumDate={new Date(2004, 0, 1)}
                    themeVariant="dark"
                  />
                )}
              </>
            )}
            {ageDecimal != null && (
              <Text style={[styles.readOnlyValue, { marginTop: 4 }]}>Age: {ageDecimal} years</Text>
            )}
          </View>

          {/* Input fields */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Standing Height</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                value={standingHeight}
                onChangeText={setStandingHeight}
                placeholder="e.g. 170"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                returnKeyType="next"
              />
              <Text style={styles.unit}>cm</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Sitting Height</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                value={sittingHeight}
                onChangeText={setSittingHeight}
                placeholder="e.g. 85"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                returnKeyType="next"
              />
              <Text style={styles.unit}>cm</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Weight</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                value={weight}
                onChangeText={setWeight}
                placeholder="e.g. 60"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
              />
              <Text style={styles.unit}>kg</Text>
            </View>
          </View>

          {/* Calculate button */}
          {!result && (
            <GradientButton
              title="Calculate"
              onPress={handleCalculate}
              icon="calculator-outline"
              style={{ marginTop: spacing.lg }}
            />
          )}

          {/* Result card */}
          {result && categoryInfo && (
            <GlassCard style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultEmoji}>{categoryInfo.emoji}</Text>
                <Text style={[styles.resultCategory, { color: categoryInfo.color }]}>{categoryInfo.label}</Text>
              </View>

              {/* LTAD Stage */}
              <View style={[styles.ltadBadge, { backgroundColor: categoryInfo.color + '15' }]}>
                <Text style={[styles.ltadLabel, { color: colors.textMuted }]}>LTAD Stage</Text>
                <Text style={[styles.ltadValue, { color: categoryInfo.color }]}>{result.ltadStage}</Text>
              </View>

              <View style={styles.resultMetrics}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Maturity Offset</Text>
                  <Text style={[styles.metricValue, { color: categoryInfo.color }]}>
                    {result.maturityOffset > 0 ? '+' : ''}{result.maturityOffset} yrs
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Leg Length</Text>
                  <Text style={styles.metricValueNeutral}>{result.legLengthCm} cm</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>W/H Ratio</Text>
                  <Text style={styles.metricValueNeutral}>{result.weightHeightRatio}</Text>
                </View>
              </View>

              <Text style={styles.trainabilityNote}>{result.trainabilityNote}</Text>

              {savedMessage ? (
                <Text style={[styles.savedMessage, { color: savedMessage.startsWith('✅') ? colors.accent : colors.error }]}>
                  {savedMessage}
                </Text>
              ) : (
                <>
                  <GradientButton
                    title="Save & Continue"
                    onPress={handleSave}
                    loading={saving}
                    icon="checkmark-circle-outline"
                    style={{ marginTop: spacing.lg }}
                  />
                  <TouchableOpacity
                    onPress={handleRecalculate}
                    style={styles.recalcButton}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.recalcText, { color: colors.accent2 }]}>Recalculate</Text>
                  </TouchableOpacity>
                </>
              )}
            </GlassCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerArea: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    headerTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: colors.textOnDark,
    },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: 120,
    },
    infoText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: spacing.xl,
      lineHeight: 20,
    },

    // Sex selector
    sexRow: {
      marginBottom: spacing.lg,
    },
    sexButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sexButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.compact,
      borderRadius: borderRadius.md,
      backgroundColor: colors.inputBackground,
    },
    sexButtonText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },

    // Read-only fields
    readOnlyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    readOnlyValue: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
    },

    // Input fields
    inputGroup: {
      marginBottom: spacing.lg,
    },
    fieldLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 16,
      paddingVertical: spacing.compact,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
    },
    datePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.compact,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
    },
    datePickerText: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
    },
    unit: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
      marginLeft: spacing.sm,
    },

    // Result
    resultCard: {
      marginTop: spacing.xl,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    resultEmoji: {
      fontSize: 24,
    },
    resultCategory: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
    },
    ltadBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.compact,
      borderRadius: borderRadius.md,
      marginBottom: spacing.md,
    },
    ltadLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
    },
    ltadValue: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
    },
    resultMetrics: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginBottom: 2,
    },
    metricValue: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
    },
    metricValueNeutral: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    trainabilityNote: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 19,
      marginTop: spacing.sm,
    },
    savedMessage: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
    },
    recalcButton: {
      alignItems: 'center',
      paddingVertical: spacing.compact,
      marginTop: spacing.sm,
    },
    recalcText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
  });
}

export default PHVCalculatorScreen;
