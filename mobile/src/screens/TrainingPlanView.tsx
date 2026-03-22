/**
 * TrainingPlanView — Training plan generation tab
 *
 * Reads ALL category config from Rules (useScheduleRules).
 * Only shows generation-specific settings:
 *   - Read-only category summary cards (from Rules)
 *   - Plan duration (weeks) stepper
 *   - Block estimate
 *   - Generate Plan CTA
 *
 * UI is unified with StudyPlanView — same banner, sections, empty state pattern.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useScheduleRules } from '../hooks/useScheduleRules';
import type { TrainingCategoryRule } from '../hooks/useScheduleRules';
import { updateUser, getCalendarEventsByRange, deleteCalendarEvent } from '../services/api';
import { generateTrainingPlan } from '../services/trainingPlanGenerator';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type {
  TrainingCategoryConfig,
  TrainingPlanConfig,
  TrainingBlock,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Component ────────────────────────────────────────────────────────

type TrainingPlanViewProps = {
  onNavigateToPreview?: (blocks: TrainingBlock[], warnings?: string[]) => void;
  onNavigateToRules?: () => void;
};

export function TrainingPlanView({ onNavigateToPreview, onNavigateToRules }: TrainingPlanViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const { rules, loading, refresh } = useScheduleRules();
  const navigation = useNavigation<any>();

  const handleNavigateToPreview = onNavigateToPreview ?? ((blocks: TrainingBlock[], warnings?: string[]) => {
    navigation.navigate('StudyPlanPreview', {
      blocks: JSON.stringify(blocks),
      warnings: warnings?.length ? JSON.stringify(warnings) : undefined,
      planType: 'training',
    });
  });
  const handleNavigateToRules = onNavigateToRules ?? (() => navigation.navigate('MyRules'));

  // Refresh data when tab is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ── Read categories from Rules (source of truth) ───────────────────

  const categories: TrainingCategoryConfig[] = useMemo(() => {
    if (rules?.preferences?.training_categories?.length) {
      return rules.preferences.training_categories.map((rc: TrainingCategoryRule) => ({
        id: rc.id,
        label: rc.label,
        icon: rc.icon,
        color: rc.color,
        enabled: rc.enabled,
        mode: rc.mode,
        fixedDays: rc.fixedDays,
        daysPerWeek: rc.daysPerWeek,
        sessionDuration: rc.sessionDuration,
        preferredTime: rc.preferredTime,
        linkedPrograms: rc.linkedPrograms,
      }));
    }
    // Fallback to profile
    return profile?.trainingPlanConfig?.categories || [];
  }, [rules?.preferences?.training_categories, profile?.trainingPlanConfig?.categories]);

  const enabledCategories = useMemo(
    () => categories.filter((c) => c.enabled),
    [categories],
  );

  // School schedule from rules
  const schoolSchedule = useMemo(() => {
    if (!rules?.preferences) return undefined;
    return {
      type: 'school' as const,
      days: rules.preferences.school_days as number[],
      startTime: rules.preferences.school_start,
      endTime: rules.preferences.school_end,
    };
  }, [rules?.preferences]);

  // ── Generation-specific state ──────────────────────────────────────

  const savedConfig = profile?.trainingPlanConfig;
  const [planWeeks, setPlanWeeks] = useState(savedConfig?.planWeeks || 2);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────

  const blockEstimate = useMemo(() => {
    let total = 0;
    for (const cat of enabledCategories) {
      const daysPerWeek = cat.mode === 'fixed_days' ? cat.fixedDays.length : cat.daysPerWeek;
      total += daysPerWeek * planWeeks;
    }
    return total;
  }, [enabledCategories, planWeeks]);

  // Config summary text for banner
  const configSummary = useMemo(() => {
    const catCount = enabledCategories.length;
    const totalSessions = enabledCategories.reduce((sum, c) => {
      return sum + (c.mode === 'fixed_days' ? c.fixedDays.length : c.daysPerWeek);
    }, 0);
    return `${catCount} categor${catCount === 1 ? 'y' : 'ies'} · ${totalSessions} sessions/wk`;
  }, [enabledCategories]);

  // ── Handlers ───────────────────────────────────────────────────────

  const saveConfig = useCallback(async (cats: TrainingCategoryConfig[], weeks: number) => {
    try {
      await updateUser({ trainingPlanConfig: { categories: cats, planWeeks: weeks } } as any);
    } catch { /* silent */ }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (enabledCategories.length === 0) {
      Alert.alert('No Categories', 'Enable at least one training category in My Rules.', [
        { text: 'Go to Rules', onPress: onNavigateToRules },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    saveConfig(categories, planWeeks);
    setIsGenerating(true);

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date(tomorrow);
      endDate.setDate(endDate.getDate() + planWeeks * 7);

      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      let existingEvents: any[] = [];
      try {
        const res = await getCalendarEventsByRange(fmt(tomorrow), fmt(endDate));
        existingEvents = res.events || [];
      } catch {
        console.warn('[TrainingPlan] Could not fetch calendar events');
      }

      const existingTrainingBlocks = existingEvents.filter((e: any) => e.type === 'training');

      const proceedWithGeneration = async (eventsForGenerator: any[]) => {
        const config: TrainingPlanConfig = { categories, planWeeks };
        const result = generateTrainingPlan(config, eventsForGenerator, schoolSchedule, undefined, rules?.effectiveRules);

        if (result.blocks.length === 0) {
          const msg = result.warnings.length > 0
            ? result.warnings.join('\n')
            : 'Could not generate any training blocks. Try adjusting your settings.';
          Alert.alert('No Blocks Generated', msg);
          setIsGenerating(false);
          return;
        }

        setIsGenerating(false);

        if (result.warnings.length > 0) {
          Alert.alert(
            'Some sessions could not be placed',
            result.warnings.join('\n'),
            [
              { text: 'View Plan Anyway', onPress: () => handleNavigateToPreview(result.blocks, result.warnings) },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        } else {
          handleNavigateToPreview(result.blocks);
        }
      };

      if (existingTrainingBlocks.length > 0) {
        setIsGenerating(false);
        Alert.alert(
          'Existing Training Plan',
          `You have ${existingTrainingBlocks.length} training block${existingTrainingBlocks.length > 1 ? 's' : ''} in your calendar. Generating will replace them.`,
          [
            {
              text: 'Replace & Generate',
              style: 'destructive',
              onPress: async () => {
                setIsGenerating(true);
                for (const block of existingTrainingBlocks) {
                  try { await deleteCalendarEvent(block.id); } catch { /* skip */ }
                }
                await proceedWithGeneration(existingEvents.filter((e: any) => e.type !== 'training'));
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }

      await proceedWithGeneration(existingEvents);
    } catch (err) {
      console.error('[TrainingPlan] Generation error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [categories, enabledCategories, planWeeks, saveConfig, handleNavigateToPreview, handleNavigateToRules, schoolSchedule, rules?.effectiveRules]);

  // ── Loading state (prevents empty-state flash) ─────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent1} />
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (categories.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="barbell-outline" size={32} color={colors.accent1} />
        </View>
        <Text style={styles.emptyTitle}>No training categories</Text>
        <Text style={styles.emptySubtitle}>
          Set up your training schedule in My Rules to generate a plan.
        </Text>
        <TouchableOpacity style={[styles.rulesBtn, { backgroundColor: `${colors.accent1}1F`, borderColor: `${colors.accent1}4D`, borderWidth: 1 }]} onPress={handleNavigateToRules}>
          <Ionicons name="options-outline" size={16} color={colors.accent1} />
          <Text style={[styles.rulesBtnText, { color: colors.accent1 }]}>Go to Rules</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ─── Config summary banner (matches Study tab) ─── */}
      <TouchableOpacity style={styles.configBanner} onPress={handleNavigateToRules} activeOpacity={0.7}>
        <View style={styles.configBannerLeft}>
          <Ionicons name="options-outline" size={14} color={colors.accent1} />
          <Text style={[styles.configBannerText, { color: colors.textSecondary }]}>
            {configSummary}
          </Text>
        </View>
        <Text style={[styles.configBannerEdit, { color: colors.accent1 }]}>Edit Rules</Text>
      </TouchableOpacity>

      {/* ─── Plan duration stepper ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Plan Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            onPress={() => {
              const v = Math.max(1, planWeeks - 1);
              setPlanWeeks(v);
              saveConfig(categories, v);
            }}
            style={[styles.stepperBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="remove" size={14} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={styles.durationValue}>{planWeeks}</Text>
          <TouchableOpacity
            onPress={() => {
              const v = Math.min(8, planWeeks + 1);
              setPlanWeeks(v);
              saveConfig(categories, v);
            }}
            style={[styles.stepperBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="add" size={14} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={[styles.durationUnit, { color: colors.textSecondary }]}>weeks</Text>
        </View>
      </View>

      {/* ─── Category summary cards (read-only) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Training Categories</Text>
        {categories.map((cat) => {
          const daysLabel = cat.mode === 'fixed_days'
            ? cat.fixedDays.map((d) => DAY_ABBR[d]).join(', ')
            : `${cat.daysPerWeek}x/wk`;

          return (
            <View
              key={cat.id}
              style={[
                styles.categoryCard,
                {
                  borderColor: cat.enabled ? `${cat.color}40` : colors.border,
                  opacity: cat.enabled ? 1 : 0.45,
                },
              ]}
            >
              <View style={styles.cardRow}>
                <View style={[styles.catIcon, { backgroundColor: `${cat.color}20` }]}>
                  <Ionicons name={cat.icon as any} size={16} color={cat.color} />
                </View>
                <View style={styles.catInfo}>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                  <Text style={[styles.catMeta, { color: colors.textInactive }]}>
                    {daysLabel} · {cat.sessionDuration}m · {cat.preferredTime}
                  </Text>
                  {cat.linkedPrograms && cat.linkedPrograms.length > 0 && (
                    <Text style={[styles.catMeta, { color: colors.info, marginTop: 2 }]} numberOfLines={2}>
                      📋 {cat.linkedPrograms.map(p => p.name).join(', ')}
                    </Text>
                  )}
                </View>
                {cat.enabled ? (
                  <View style={[styles.statusDot, { backgroundColor: cat.color }]} />
                ) : (
                  <Text style={[styles.disabledLabel, { color: colors.textInactive }]}>Off</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ─── Block Estimate ─── */}
      {blockEstimate > 0 && (
        <View style={styles.estimateRow}>
          <Ionicons name="layers-outline" size={16} color={colors.accent1} />
          <Text style={styles.estimateText}>~{blockEstimate} training blocks</Text>
        </View>
      )}

      {/* ─── Generate CTA ─── */}
      <TouchableOpacity
        style={[styles.generateBtn, {
          opacity: isGenerating || enabledCategories.length === 0 ? 0.4 : 1,
          backgroundColor: `${colors.accent1}1F`,
          borderWidth: 1,
          borderColor: `${colors.accent1}4D`,
        }]}
        onPress={handleGenerate}
        disabled={isGenerating || enabledCategories.length === 0}
        activeOpacity={0.7}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color={colors.accent1} />
        ) : (
          <Ionicons name="sparkles" size={16} color={colors.accent1} />
        )}
        <Text style={[styles.generateBtnText, { color: colors.accent1 }]}>
          {isGenerating ? 'Checking calendar...' : 'Generate Training Plan'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      padding: spacing.lg,
      paddingBottom: 40,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },

    // Empty state (matches Study tab)
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 60,
      gap: spacing.md,
      padding: spacing.lg,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: `${colors.accent1}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: fontFamily.regular,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
    },
    rulesBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: spacing.sm,
    },
    rulesBtnText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },

    // Config banner (matches Study tab exactly)
    configBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: `${colors.accent1}08`,
      borderWidth: 1,
      borderColor: `${colors.accent1}20`,
      marginBottom: spacing.lg,
    },
    configBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    configBannerText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
    configBannerEdit: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
    },

    // Section (matches Study tab)
    section: {
      marginBottom: spacing.lg,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: fontFamily.semiBold,
      color: colors.textInactive,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },

    // Duration stepper
    durationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    durationValue: {
      fontSize: 22,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      minWidth: 24,
      textAlign: 'center',
    },
    durationUnit: {
      fontSize: 15,
      fontFamily: fontFamily.medium,
      marginLeft: 2,
    },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Category card (read-only)
    categoryCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    catIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catInfo: {
      flex: 1,
    },
    catLabel: {
      fontSize: 15,
      fontFamily: fontFamily.semiBold,
      color: colors.textOnDark,
    },
    catMeta: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      marginTop: 2,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    disabledLabel: {
      fontSize: 12,
      fontFamily: fontFamily.medium,
    },

    // Estimate (matches Study tab)
    estimateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: `${colors.accent1}10`,
      alignSelf: 'center',
    },
    estimateText: {
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
      color: colors.accent1,
    },

    // Generate button (subtle style — matches "Ask Tomo" in My Programs)
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    generateBtnText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
  });
}
