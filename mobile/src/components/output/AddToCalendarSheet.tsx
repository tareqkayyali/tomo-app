/**
 * AttachToTrainingSheet — Bottom sheet to link a program to a training category.
 *
 * Shows the user's training categories from My Rules. Tapping one links
 * the program to that category. When that training type appears on the
 * calendar, the program shows in the event notes.
 *
 * Also offers a "Create New Category" option that pre-fills with the
 * program's category name.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useScheduleRules } from '../../hooks/useScheduleRules';
import type { TrainingCategoryRule, LinkedProgram } from '../../hooks/useScheduleRules';

import { colors } from '../../theme/colors';

// ── Props ─────────────────────────────────────────────────────────

export interface AttachToTrainingSheetProps {
  visible: boolean;
  onClose: () => void;
  program: {
    programId: string;
    name: string;
    category: string;
    type: string;
    frequency: string;
    durationMin: number;
    durationWeeks?: number;
  } | null;
}

// Re-export with the old name for backward compatibility
export type AddToCalendarSheetProps = AttachToTrainingSheetProps;

// ── Day label helper ──────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDays(rule: TrainingCategoryRule): string {
  if (rule.mode === 'fixed_days' && rule.fixedDays.length > 0) {
    return rule.fixedDays.map((d) => DAY_ABBR[d]).join(', ');
  }
  if (rule.mode === 'days_per_week') {
    return `${rule.daysPerWeek}x / week`;
  }
  return '';
}

// ── Main Component ───────────────────────────────────────────────

export function AttachToTrainingSheet({ visible, onClose, program }: AttachToTrainingSheetProps) {
  const { colors } = useTheme();
  const { rules, update, loading: rulesLoading } = useScheduleRules();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const categories = rules?.preferences?.training_categories ?? [];

  // Reset state on close
  useEffect(() => {
    if (!visible) {
      setSuccess(null);
      setError(null);
      setShowCreateNew(false);
      setNewCategoryName('');
    }
  }, [visible]);

  // Pre-fill new category name from program category
  useEffect(() => {
    if (showCreateNew && program) {
      const label = program.category
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setNewCategoryName(label);
    }
  }, [showCreateNew, program]);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Check if program is already linked to a category
  const linkedCategoryId = categories.find((cat) =>
    cat.linkedPrograms?.some((lp) => lp.programId === program?.programId)
  )?.id;

  // ── Link program to existing category ──
  const handleLinkToCategory = useCallback(async (categoryId: string) => {
    if (!program) return;
    haptic();
    setSaving(true);
    setError(null);

    try {
      const updatedCategories = categories.map((cat) => {
        // Remove this program from any other category first
        const filtered = (cat.linkedPrograms ?? []).filter(
          (lp) => lp.programId !== program.programId
        );

        if (cat.id === categoryId) {
          // Add program to this category
          const newLinked: LinkedProgram = {
            programId: program.programId,
            name: program.name,
            category: program.category,
          };
          return { ...cat, linkedPrograms: [...filtered, newLinked] };
        }

        return { ...cat, linkedPrograms: filtered };
      });

      await update({ training_categories: updatedCategories });

      const categoryLabel = categories.find((c) => c.id === categoryId)?.label ?? categoryId;
      setSuccess(`Linked to ${categoryLabel}`);
      setTimeout(() => onClose(), 1200);
    } catch (e: any) {
      setError(e.message || 'Failed to link program');
    } finally {
      setSaving(false);
    }
  }, [program, categories, update, haptic, onClose]);

  // ── Unlink program from its category ──
  const handleUnlink = useCallback(async () => {
    if (!program) return;
    haptic();
    setSaving(true);
    setError(null);

    try {
      const updatedCategories = categories.map((cat) => ({
        ...cat,
        linkedPrograms: (cat.linkedPrograms ?? []).filter(
          (lp) => lp.programId !== program.programId
        ),
      }));

      await update({ training_categories: updatedCategories });

      setSuccess('Program unlinked');
      setTimeout(() => onClose(), 1200);
    } catch (e: any) {
      setError(e.message || 'Failed to unlink program');
    } finally {
      setSaving(false);
    }
  }, [program, categories, update, haptic, onClose]);

  // ── Create new category + link ──
  const handleCreateAndLink = useCallback(async () => {
    if (!program || !newCategoryName.trim()) return;
    haptic();
    setSaving(true);
    setError(null);

    try {
      const newId = `custom_${Date.now()}`;
      const newCategory: TrainingCategoryRule = {
        id: newId,
        label: newCategoryName.trim(),
        icon: 'fitness-outline',
        color: colors.accent,
        enabled: true,
        mode: 'days_per_week',
        fixedDays: [],
        daysPerWeek: 2,
        sessionDuration: program.durationMin || 60,
        preferredTime: 'afternoon',
        linkedPrograms: [{
          programId: program.programId,
          name: program.name,
          category: program.category,
        }],
      };

      const updatedCategories = [...categories, newCategory];
      await update({ training_categories: updatedCategories });

      setSuccess(`Created "${newCategoryName.trim()}" and linked`);
      setTimeout(() => onClose(), 1200);
    } catch (e: any) {
      setError(e.message || 'Failed to create category');
    } finally {
      setSaving(false);
    }
  }, [program, newCategoryName, categories, update, haptic, onClose]);

  if (!program) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceSheet }]} onPress={(e) => e.stopPropagation()}>
          {/* Handle pill */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.textMuted + '40' }]} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textOnDark }]}>Add to Training</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {program.name} · {program.durationMin} min/session · {program.durationWeeks || 4} weeks
          </Text>

          {/* Success / Error banners */}
          {success && (
            <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
              <SmartIcon name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.bannerText, { color: colors.accent }]}>{success}</Text>
            </View>
          )}
          {error && (
            <View style={[styles.banner, { backgroundColor: colors.secondarySubtle }]}>
              <SmartIcon name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
            </View>
          )}

          {/* Content */}
          {!success && (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {rulesLoading ? (
                <Loader size="sm" style={{ marginTop: 24 }} />
              ) : !showCreateNew ? (
                <>
                  {/* Instruction */}
                  <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                    Pick a training category. When that type appears on your calendar, this program will show in the session.
                  </Text>

                  {/* Category rows */}
                  {categories.filter((c) => c.enabled).length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <SmartIcon name="barbell-outline" size={28} color={colors.textMuted} />
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                        No training categories set up yet
                      </Text>
                    </View>
                  ) : (
                    categories.filter((c) => c.enabled).map((cat) => {
                      const isLinked = cat.id === linkedCategoryId;
                      const linkedCount = (cat.linkedPrograms ?? []).length;

                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            if (isLinked) {
                              handleUnlink();
                            } else {
                              handleLinkToCategory(cat.id);
                            }
                          }}
                          disabled={saving}
                          style={({ pressed }) => [
                            styles.categoryRow,
                            {
                              backgroundColor: isLinked ? colors.accent1 + '15' : colors.glass,
                              borderColor: isLinked ? colors.accent1 + '40' : 'transparent',
                              opacity: pressed ? 0.7 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.categoryIcon, { backgroundColor: cat.color + '22' }]}>
                            <SmartIcon name={cat.icon as any} size={20} color={cat.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.categoryName, { color: colors.textOnDark }]}>
                              {cat.label}
                            </Text>
                            <Text style={[styles.categoryMeta, { color: colors.textMuted }]}>
                              {formatDays(cat)}
                              {linkedCount > 0
                                ? ` · ${linkedCount} program${linkedCount > 1 ? 's' : ''} linked`
                                : ''}
                            </Text>
                          </View>
                          {isLinked ? (
                            <SmartIcon name="checkmark-circle" size={22} color={colors.accent1} />
                          ) : (
                            <SmartIcon name="add-circle-outline" size={22} color={colors.textMuted} />
                          )}
                        </Pressable>
                      );
                    })
                  )}

                  {/* Create New Category */}
                  <Pressable
                    onPress={() => { setShowCreateNew(true); haptic(); }}
                    style={({ pressed }) => [
                      styles.createNewBtn,
                      { backgroundColor: colors.glass, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <SmartIcon name="add" size={20} color={colors.accent2} />
                    <Text style={[styles.createNewText, { color: colors.accent2 }]}>
                      Create New Category
                    </Text>
                  </Pressable>
                </>
              ) : (
                /* ── Create New Category Form ── */
                <>
                  <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                    Create a new training category and link this program to it.
                  </Text>

                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Category Name</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground || colors.creamSubtle }]}>
                    <TextInput
                      value={newCategoryName}
                      onChangeText={setNewCategoryName}
                      placeholder="e.g. Speed, Strength, Agility"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.textInput, { color: colors.textOnDark }]}
                      autoFocus
                    />
                  </View>

                  <View style={styles.createFormActions}>
                    <Pressable
                      onPress={() => { setShowCreateNew(false); haptic(); }}
                      style={[styles.cancelBtn, { backgroundColor: colors.glass }]}
                    >
                      <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreateAndLink}
                      disabled={saving || !newCategoryName.trim()}
                      style={({ pressed }) => [
                        styles.confirmBtn,
                        {
                          backgroundColor: newCategoryName.trim() ? colors.accent1 : colors.glass,
                          opacity: pressed ? 0.8 : newCategoryName.trim() ? 1 : 0.5,
                        },
                      ]}
                    >
                      {saving ? (
                        <Loader size="sm" />
                      ) : (
                        <>
                          <SmartIcon name="checkmark" size={18} color={colors.textPrimary} />
                          <Text style={styles.confirmBtnText}>Create & Link</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Keep old export name for backward compat
export { AttachToTrainingSheet as AddToCalendarSheet };

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    maxHeight: '75%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },

  // Banners
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  bannerText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },

  // Content
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: 400,
  },

  sectionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },

  // Category rows
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.compact,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  categoryMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },

  // Empty state
  emptyBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },

  // Create new
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  createNewText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },

  // Create form
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: spacing.md,
  },
  textInput: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  createFormActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
  },
  confirmBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
