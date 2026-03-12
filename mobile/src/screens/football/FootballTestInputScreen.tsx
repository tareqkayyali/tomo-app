/**
 * FootballTestInputScreen — Generic input + result screen for football tests.
 *
 * Renders dynamic input fields and results based on the test definition
 * from FOOTBALL_TEST_DEFS. Supports number inputs, select pills, and the
 * special self-assessment mode with 24 slider rows.
 *
 * State machine: 'input' → 'result'
 *
 * Result phase shows:
 * - Large primary result value
 * - Derived metrics row
 * - Percentile bar with age norm context
 * - Personal best check with confetti
 * - Save & Retake buttons
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFootballTestPBKey } from '../../constants/storageKeys';
import ConfettiCannon from 'react-native-confetti-cannon';

import { GlassCard, GradientButton } from '../../components';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { saveFootballTestResult } from '../../services/api';

import {
  useTestDefinition,
  type TestDefinition,
  type InputFieldDef,
} from '../../hooks/useContentHelpers';
import {
  resolveAgilityMetricName,
  normalCDF,
  calculateSelfAssessmentRating,
} from '../../services/derivedMetricCalculators';
import {
  getFootballTestDef,
  getSelfAssessmentSliders,
} from '../../data/footballTestDefs';
import type { SelfAssessmentSlider } from '../../data/footballTestDefs';
import { getMetricNorm, getMetricMeanForAge } from '../../data/footballNormativeData';

import { fontFamily, spacing, borderRadius, layout } from '../../theme';
import type { ThemeColors } from '../../theme/colors';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ═══ TYPES ═══

type Props = NativeStackScreenProps<MainStackParamList, 'FootballTestInput'>;

type Phase = 'input' | 'result';

interface ResultData {
  primaryValue: number;
  primaryUnit: string;
  primaryLabel: string;
  derived: Array<{ label: string; value: number; unit: string }>;
  percentile: number | null;
  percentileLabel: string;
  ageMean: number | null;
  ageMeanUnit: string;
  isNewPB: boolean;
  previousBest: number | null;
}

// ═══ PERCENTILE GROWTH LABELS ═══

function getGrowthLabel(pct: number): string {
  if (pct >= 80) return 'Outstanding';
  if (pct >= 60) return 'Above average';
  if (pct >= 40) return 'Developing nicely';
  if (pct >= 20) return 'Room to grow';
  return 'Early stages';
}

// ═══ STORAGE KEYS ═══

function getPBKey(testId: string): string {
  return getFootballTestPBKey(testId);
}

// ═══ COMPONENT ═══

export function FootballTestInputScreen({ route, navigation }: Props) {
  const { testId } = route.params;
  // Content-driven test def (from DB), falling back to hardcoded
  const contentTestDef = useTestDefinition('football', testId);
  const testDef = contentTestDef ?? getFootballTestDef(testId);
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const age = (profile as any)?.age ?? 16;

  const [phase, setPhase] = useState<Phase>('input');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [selfRatings, setSelfRatings] = useState<Record<string, number>>({});
  const [showResearchNote, setShowResearchNote] = useState(false);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<ConfettiCannon | null>(null);

  // Animated percentile bar
  const percentileFill = useSharedValue(0);
  const percentileStyle = useAnimatedStyle(() => ({
    width: `${percentileFill.value}%` as any,
  }));

  // Self-assessment sliders
  const selfSliders = useMemo(() => {
    if (testId === 'selfAssessment') return getSelfAssessmentSliders();
    return [];
  }, [testId]);

  if (!testDef) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.errorText}>Test not found.</Text>
      </SafeAreaView>
    );
  }

  const isSelfAssessment = testDef.id === 'selfAssessment';

  // ── Input handlers ──

  const handleInputChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleSelectChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleSelfRating = (compositeKey: string, value: number) => {
    setSelfRatings(prev => ({ ...prev, [compositeKey]: value }));
  };

  // ── Validation ──

  const isValid = useMemo(() => {
    if (isSelfAssessment) {
      return Object.keys(selfRatings).length === selfSliders.length;
    }
    return testDef.inputs
      .filter(f => f.required)
      .every(f => {
        const val = inputs[f.key];
        if (f.type === 'select') return !!val;
        const num = Number(val);
        return val !== undefined && val !== '' && !isNaN(num) && num > 0;
      });
  }, [inputs, selfRatings, testDef, isSelfAssessment, selfSliders]);

  // Special: for jump test, at least one of cmjHeight or flightTime required
  const isJumpValid = useMemo(() => {
    if (testId !== 'jump') return true;
    const h = Number(inputs.cmjHeight);
    const ft = Number(inputs.flightTime);
    return (!isNaN(h) && h > 0) || (!isNaN(ft) && ft > 0);
  }, [testId, inputs]);

  const canCalculate = isSelfAssessment ? isValid : (isValid && isJumpValid);

  // ── Calculate results ──

  const handleCalculate = useCallback(async () => {
    if (!testDef) return;

    if (isSelfAssessment) {
      const overallRating = calculateSelfAssessmentRating(selfRatings);
      setResultData({
        primaryValue: overallRating,
        primaryUnit: '/99',
        primaryLabel: 'Overall Self-Rating',
        derived: [],
        percentile: null,
        percentileLabel: '',
        ageMean: null,
        ageMeanUnit: '',
        isNewPB: false,
        previousBest: null,
      });
      setPhase('result');
      return;
    }

    // Parse numeric inputs
    const numInputs: Record<string, number | string> = {};
    for (const field of testDef.inputs) {
      const raw = inputs[field.key];
      if (field.type === 'number') {
        numInputs[field.key] = Number(raw) || 0;
      } else {
        numInputs[field.key] = raw || '';
      }
    }

    // Primary value
    let primaryValue = Number(numInputs[testDef.primaryInputKey]) || 0;
    const primaryLabel = testDef.inputs.find(f => f.key === testDef.primaryInputKey)?.label || testDef.name;
    const primaryUnit = testDef.inputs.find(f => f.key === testDef.primaryInputKey)?.unit || '';

    // Special: jump test — use cmjHeight if available, else derive from flight time
    if (testId === 'jump' && !primaryValue) {
      const ft = Number(numInputs.flightTime);
      if (ft > 0) {
        const tSec = ft / 1000;
        primaryValue = Math.round(((9.81 * tSec * tSec) / 8) * 100 * 10) / 10;
      }
    }

    // Derived metrics
    const derived: Array<{ label: string; value: number; unit: string }> = [];
    for (const dm of testDef.derivedMetrics) {
      const val = dm.calculate(numInputs);
      if (val !== null) {
        derived.push({ label: dm.label, value: val, unit: dm.unit });
      }
    }

    // Percentile calculation
    let percentile: number | null = null;
    let percentileLabel = '';
    let ageMean: number | null = null;
    let ageMeanUnit = '';

    // Resolve metric name (agility is dynamic)
    let metricName = testDef.primaryMetricName;
    if (testId === 'agility') {
      const agilityType = String(numInputs.agilityType || 'illinois');
      metricName = resolveAgilityMetricName(agilityType);
    }

    const norm = getMetricNorm(metricName);
    if (norm && primaryValue > 0) {
      const ageIdx = Math.min(Math.max(age - 13, 0), 10);
      const mean = norm.means[ageIdx];
      const sd = norm.sds[ageIdx];
      const z = norm.direction === 'lower'
        ? (mean - primaryValue) / sd
        : (primaryValue - mean) / sd;
      const pct = Math.min(Math.max(Math.round(normalCDF(z) * 100), 0), 100);
      percentile = pct;
      percentileLabel = getGrowthLabel(pct);
      ageMean = mean;
      ageMeanUnit = norm.unit;
    }

    // Personal best check
    const pbKey = getPBKey(testId);
    let previousBest: number | null = null;
    let isNewPB = false;
    try {
      const stored = await AsyncStorage.getItem(pbKey);
      if (stored) {
        previousBest = Number(stored);
        if (norm?.direction === 'lower') {
          isNewPB = primaryValue < previousBest;
        } else {
          isNewPB = primaryValue > previousBest;
        }
      } else {
        isNewPB = true;
      }
    } catch {}

    setResultData({
      primaryValue,
      primaryUnit: primaryUnit,
      primaryLabel,
      derived,
      percentile,
      percentileLabel,
      ageMean,
      ageMeanUnit,
      isNewPB,
      previousBest,
    });
    setPhase('result');

    // Animate percentile bar
    if (percentile !== null) {
      percentileFill.value = 0;
      percentileFill.value = withDelay(
        200,
        withTiming(percentile, { duration: 600, easing: Easing.out(Easing.cubic) }),
      );
    }

    // Confetti for new PB
    if (isNewPB) {
      setTimeout(() => setShowConfetti(true), 400);
    }
  }, [testDef, inputs, selfRatings, age, testId, isSelfAssessment, percentileFill]);

  // ── Save result ──

  const handleSave = useCallback(async () => {
    if (!resultData || isSelfAssessment) {
      navigation.goBack();
      return;
    }

    // 1. Local PB tracking (AsyncStorage — instant, offline-safe)
    try {
      const pbKey = getPBKey(testId);
      const norm = getMetricNorm(testDef.primaryMetricName);
      const stored = await AsyncStorage.getItem(pbKey);
      const current = Number(stored);
      const shouldUpdate = !stored || (
        norm?.direction === 'lower'
          ? resultData.primaryValue < current
          : resultData.primaryValue > current
      );
      if (shouldUpdate) {
        await AsyncStorage.setItem(pbKey, String(resultData.primaryValue));
      }
    } catch {}

    // 2. Persist full result to Supabase (fire-and-forget)
    try {
      saveFootballTestResult({
        testType: testId,
        primaryValue: resultData.primaryValue,
        primaryUnit: resultData.primaryUnit,
        primaryLabel: resultData.primaryLabel,
        derivedMetrics: resultData.derived,
        percentile: resultData.percentile,
        percentileLabel: resultData.percentileLabel,
        ageMean: resultData.ageMean,
        ageMeanUnit: resultData.ageMeanUnit,
        isNewPB: resultData.isNewPB,
        previousBest: resultData.previousBest,
        rawInputs: inputs,
      }).catch((err) => {
        console.warn('[FootballTest] Failed to persist result to server:', err);
      });
    } catch {}

    navigation.goBack();
  }, [resultData, testId, testDef, navigation, isSelfAssessment, inputs]);

  // ── Retake ──

  const handleRetake = useCallback(() => {
    setPhase('input');
    setResultData(null);
    setShowConfetti(false);
    setInputs({});
    setSelfRatings({});
    percentileFill.value = 0;
  }, [percentileFill]);

  // ── Toggle research note ──

  const toggleResearchNote = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowResearchNote(prev => !prev);
  }, []);

  // ═══ RENDER ═══

  if (phase === 'result' && resultData) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Primary Result */}
          <View style={styles.resultHero}>
            <Ionicons name={testDef.icon as any} size={36} color={testDef.color} />
            <Text style={styles.resultTitle}>{testDef.name}</Text>
            <View style={styles.resultValueRow}>
              <Text style={styles.resultValue}>{resultData.primaryValue}</Text>
              <Text style={styles.resultUnit}>{resultData.primaryUnit}</Text>
            </View>
            <Text style={styles.resultLabel}>{resultData.primaryLabel}</Text>
          </View>

          {/* New PB Badge */}
          {resultData.isNewPB && (
            <View style={styles.pbBadge}>
              <Ionicons name="trophy" size={16} color="#FFD700" />
              <Text style={styles.pbBadgeText}>New Personal Best!</Text>
            </View>
          )}

          {/* Derived Metrics */}
          {resultData.derived.length > 0 && (
            <View style={styles.derivedRow}>
              {resultData.derived.map((dm) => (
                <GlassCard key={dm.label} style={styles.derivedCard}>
                  <Text style={styles.derivedValue}>{dm.value}</Text>
                  <Text style={styles.derivedUnit}>{dm.unit}</Text>
                  <Text style={styles.derivedLabel}>{dm.label}</Text>
                </GlassCard>
              ))}
            </View>
          )}

          {/* Percentile Bar */}
          {resultData.percentile !== null && (
            <GlassCard style={styles.percentileCard}>
              <View style={styles.percentileHeader}>
                <Text style={styles.percentileTitle}>Age Percentile</Text>
                <Text style={styles.percentilePct}>{resultData.percentile}th</Text>
              </View>

              <View style={styles.percentileBarBg}>
                <Animated.View style={[styles.percentileBarFill, percentileStyle]}>
                  <LinearGradient
                    colors={[colors.accent1, colors.accent2]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>

              <Text style={styles.percentileGrowth}>{resultData.percentileLabel}</Text>

              {resultData.ageMean !== null && (
                <Text style={styles.ageNormText}>
                  Average for age {age}: {resultData.ageMean}{resultData.ageMeanUnit}
                </Text>
              )}
            </GlassCard>
          )}

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <GradientButton title="Save & Done" onPress={handleSave} />
          </View>
          <Pressable onPress={handleRetake} style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>Retake</Text>
          </Pressable>
        </ScrollView>

        {/* Confetti */}
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

  // ═══ INPUT PHASE ═══

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.inputHeader}>
          <View style={[styles.inputIconBox, { backgroundColor: testDef.color + '18' }]}>
            <Ionicons name={testDef.icon as any} size={32} color={testDef.color} />
          </View>
          <Text style={styles.inputTitle}>{testDef.name}</Text>
          <Text style={styles.inputDesc}>{testDef.description}</Text>
        </View>

        {/* Research Note Toggle */}
        <Pressable onPress={toggleResearchNote} style={styles.researchToggle}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textInactive} />
          <Text style={styles.researchToggleText}>Research context</Text>
          <Ionicons
            name={showResearchNote ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textInactive}
          />
        </Pressable>
        {showResearchNote && (
          <GlassCard style={styles.researchCard}>
            <Text style={styles.researchText}>{testDef.researchNote}</Text>
          </GlassCard>
        )}

        {/* Dynamic Inputs OR Self-Assessment */}
        {isSelfAssessment ? (
          <SelfAssessmentInputs
            sliders={selfSliders}
            ratings={selfRatings}
            onRate={handleSelfRating}
          />
        ) : (
          <View style={styles.inputFields}>
            {testDef.inputs.map((field) => (
              <InputField
                key={field.key}
                field={field}
                value={inputs[field.key] || ''}
                onChange={(v) => field.type === 'select'
                  ? handleSelectChange(field.key, v)
                  : handleInputChange(field.key, v)
                }
              />
            ))}
          </View>
        )}

        {/* Calculate Button */}
        <View style={styles.calculateRow}>
          <GradientButton
            title="Calculate Results"
            onPress={handleCalculate}
            disabled={!canCalculate}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══ INPUT FIELD COMPONENT ═══

function InputField({
  field,
  value,
  onChange,
}: {
  field: InputFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (field.type === 'select' && field.options) {
    return (
      <View style={styles.fieldContainer}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          {field.required && <View style={styles.requiredDot} />}
        </View>
        <View style={styles.selectRow}>
          {field.options.map((opt) => {
            const isActive = value === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange(opt.value)}
                style={[styles.selectPill, isActive && styles.selectPillActive]}
              >
                {isActive ? (
                  <LinearGradient
                    colors={[colors.accent1, colors.accent2]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
                  />
                ) : null}
                <Text style={[styles.selectPillText, isActive && styles.selectPillTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.required ? (
          <View style={styles.requiredDot} />
        ) : (
          <Text style={styles.optionalBadge}>Optional</Text>
        )}
      </View>
      <View style={styles.textInputWrap}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          returnKeyType="done"
        />
        {field.unit ? <Text style={styles.unitSuffix}>{field.unit}</Text> : null}
      </View>
    </View>
  );
}

// ═══ SELF-ASSESSMENT INPUTS ═══

function SelfAssessmentInputs({
  sliders,
  ratings,
  onRate,
}: {
  sliders: SelfAssessmentSlider[];
  ratings: Record<string, number>;
  onRate: (key: string, value: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Group by skill
  const grouped = useMemo(() => {
    const map: Record<string, SelfAssessmentSlider[]> = {};
    for (const s of sliders) {
      if (!map[s.skillKey]) map[s.skillKey] = [];
      map[s.skillKey].push(s);
    }
    return Object.entries(map);
  }, [sliders]);

  return (
    <View style={styles.selfAssessmentWrap}>
      {grouped.map(([skillKey, subs]) => (
        <GlassCard key={skillKey} style={styles.selfSkillCard}>
          <Text style={styles.selfSkillName}>{subs[0].skillName}</Text>
          {subs.map((sub) => {
            const compositeKey = `${sub.skillKey}_${sub.subKey}`;
            const current = ratings[compositeKey] || 0;
            return (
              <View key={compositeKey} style={styles.selfSliderRow}>
                <Text style={styles.selfSliderLabel}>{sub.subLabel}</Text>
                <View style={styles.selfButtonRow}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => onRate(compositeKey, v)}
                      style={[
                        styles.selfRatingButton,
                        current === v && styles.selfRatingButtonActive,
                      ]}
                    >
                      {current === v ? (
                        <LinearGradient
                          colors={[colors.accent1, colors.accent2]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
                        />
                      ) : null}
                      <Text style={[
                        styles.selfRatingText,
                        current === v && styles.selfRatingTextActive,
                      ]}>
                        {v}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </GlassCard>
      ))}
    </View>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    errorText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textInactive,
      textAlign: 'center',
      marginTop: spacing.huge,
    },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.xl,
      gap: spacing.md,
    },

    // ── Input Phase Header ──
    inputHeader: {
      alignItems: 'center',
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    inputIconBox: {
      width: 64,
      height: 64,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
    },
    inputDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      textAlign: 'center',
      lineHeight: 20,
    },

    // ── Research Note ──
    researchToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      paddingVertical: spacing.xs,
    },
    researchToggleText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
    },
    researchCard: {
      marginBottom: spacing.sm,
    },
    researchText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      lineHeight: 18,
    },

    // ── Input Fields ──
    inputFields: {
      gap: spacing.md,
    },
    fieldContainer: {
      gap: spacing.xs,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    fieldLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },
    requiredDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent1,
    },
    optionalBadge: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textMuted,
      backgroundColor: colors.glass,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      overflow: 'hidden',
    },
    textInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: borderRadius.md,
      height: 56,
      paddingHorizontal: spacing.md,
    },
    textInput: {
      flex: 1,
      fontFamily: fontFamily.medium,
      fontSize: 18,
      color: colors.textOnDark,
      height: 56,
    },
    unitSuffix: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
      marginLeft: spacing.sm,
    },

    // ── Select Pills ──
    selectRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    selectPill: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    selectPillActive: {
      borderColor: 'transparent',
    },
    selectPillText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
    },
    selectPillTextActive: {
      color: '#FFFFFF',
      fontFamily: fontFamily.semiBold,
    },

    // ── Calculate Button ──
    calculateRow: {
      marginTop: spacing.lg,
    },

    // ── Result Phase ──
    resultHero: {
      alignItems: 'center',
      paddingTop: spacing.xl,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    resultTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textInactive,
    },
    resultValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    resultValue: {
      fontFamily: fontFamily.bold,
      fontSize: 48,
      color: colors.textOnDark,
    },
    resultUnit: {
      fontFamily: fontFamily.medium,
      fontSize: 20,
      color: colors.textInactive,
    },
    resultLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
    },

    // ── PB Badge ──
    pbBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      backgroundColor: 'rgba(48, 209, 88, 0.15)',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
    },
    pbBadgeText: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      color: '#30D158',
    },

    // ── Derived Metrics ──
    derivedRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    derivedCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    derivedValue: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.textOnDark,
    },
    derivedUnit: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginTop: 2,
    },
    derivedLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 4,
    },

    // ── Percentile ──
    percentileCard: {
      gap: spacing.sm,
    },
    percentileHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    percentileTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    percentilePct: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.accent1,
    },
    percentileBarBg: {
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    percentileBarFill: {
      height: 12,
      borderRadius: 6,
      overflow: 'hidden',
    },
    percentileGrowth: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.accent2,
    },
    ageNormText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },

    // ── Action Buttons ──
    actionRow: {
      marginTop: spacing.lg,
    },
    ghostButton: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    ghostButtonText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textInactive,
    },

    // ── Self-Assessment ──
    selfAssessmentWrap: {
      gap: spacing.md,
    },
    selfSkillCard: {
      gap: spacing.sm,
    },
    selfSkillName: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    selfSliderRow: {
      gap: spacing.xs,
    },
    selfSliderLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
    },
    selfButtonRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    selfRatingButton: {
      flex: 1,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    selfRatingButtonActive: {
      borderColor: 'transparent',
    },
    selfRatingText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textInactive,
    },
    selfRatingTextActive: {
      color: '#FFFFFF',
    },
  });
}
