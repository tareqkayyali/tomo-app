/**
 * Coach Add Program Screen — Gen Z design
 *
 * Full-featured program creation form with:
 * - Program name & description
 * - Duration, frequency, intensity
 * - Drill selection with sets/reps/RPE
 * - Start/end date
 * - Push to player's calendar
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { createSuggestion } from '../../services/api';
import { GlassCard } from '../../components/GlassCard';
import { spacing, borderRadius, fontFamily, layout } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachAddProgram'>;

const INTENSITY_OPTIONS = ['Low', 'Moderate', 'High'] as const;
const FREQUENCY_OPTIONS = ['1x/week', '2x/week', '3x/week', '4x/week', '5x/week', 'Daily'] as const;
const DURATION_OPTIONS = ['2 weeks', '4 weeks', '6 weeks', '8 weeks', '12 weeks'] as const;
const CATEGORY_OPTIONS = [
  { key: 'strength', label: 'Strength', emoji: '💪', color: colors.info },
  { key: 'speed', label: 'Speed', emoji: '⚡', color: colors.accent },
  { key: 'endurance', label: 'Endurance', emoji: '🫁', color: colors.accent },
  { key: 'power', label: 'Power', emoji: '💥', color: colors.error },
  { key: 'agility', label: 'Agility', emoji: '🔀', color: colors.warning },
  { key: 'technical', label: 'Technical', emoji: '⚽', color: colors.info },
  { key: 'recovery', label: 'Recovery', emoji: '🧘', color: colors.textSecondary },
  { key: 'acl_prevention', label: 'ACL Prevention', emoji: '🛡️', color: colors.info },
] as const;

interface DrillEntry {
  id: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
}

export function CoachAddProgramScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('strength');
  const [intensity, setIntensity] = useState<string>('Moderate');
  const [frequency, setFrequency] = useState<string>('3x/week');
  const [duration, setDuration] = useState<string>('4 weeks');
  const [coachNotes, setCoachNotes] = useState('');
  const [drills, setDrills] = useState<DrillEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Add drill
  const addDrill = useCallback(() => {
    setDrills(prev => [
      ...prev,
      { id: Date.now().toString(), name: '', sets: '3', reps: '10', rest: '60s', notes: '' },
    ]);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const updateDrill = useCallback((id: string, field: keyof DrillEntry, value: string) => {
    setDrills(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  }, []);

  const removeDrill = useCallback((id: string) => {
    setDrills(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a program name.');
      } else {
        Alert.alert('Missing Info', 'Please enter a program name.');
      }
      return;
    }

    setSaving(true);
    try {
      const weeks = parseInt(duration) || 4;
      const selectedCatInfo = CATEGORY_OPTIONS.find(c => c.key === category);

      await createSuggestion({
        playerId,
        suggestionType: 'calendar_event',
        title: `Training Program: ${name}`,
        payload: {
          type: 'program',
          programName: name,
          description,
          category,
          categoryLabel: selectedCatInfo?.label || category,
          intensity: intensity.toLowerCase(),
          frequency,
          duration: `${weeks} weeks`,
          weeks,
          drills: drills.filter(d => d.name.trim()).map(d => ({
            name: d.name,
            sets: d.sets,
            reps: d.reps,
            rest: d.rest,
            notes: d.notes,
          })),
          coachNotes,
        },
      });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg = `"${name}" has been sent to ${playerName.split(' ')[0]}. They'll receive a notification to review it.`;
      if (Platform.OS === 'web') {
        window.alert(msg);
        navigation.goBack();
      } else {
        Alert.alert('Program Sent', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (err) {
      if (Platform.OS === 'web') {
        window.alert('Failed to send program. Please try again.');
      } else {
        Alert.alert('Tomo', 'Failed to send program. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedCat = CATEGORY_OPTIONS.find(c => c.key === category);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Context banner */}
        <View style={[styles.contextBanner, { backgroundColor: colors.accent1 + '10' }]}>
          <Ionicons name="barbell-outline" size={14} color={colors.accent1} />
          <Text style={[styles.contextText, { color: colors.accent1 }]}>
            Creating program for {playerName}
          </Text>
        </View>

        {/* Program Name */}
        <GlassCard>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Program Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pre-Season Sprint Development"
            placeholderTextColor={colors.textInactive}
            style={[styles.textInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.md }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of goals and focus areas..."
            placeholderTextColor={colors.textInactive}
            multiline
            numberOfLines={3}
            style={[styles.textAreaInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
          />
        </GlassCard>

        {/* Category */}
        <GlassCard>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
          <View style={styles.chipGrid}>
            {CATEGORY_OPTIONS.map(cat => {
              const isActive = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isActive ? cat.color + '22' : colors.glass,
                      borderColor: isActive ? cat.color : 'transparent',
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.categoryLabel, { color: isActive ? cat.color : colors.textMuted }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* Parameters */}
        <GlassCard>
          <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Parameters</Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Intensity</Text>
          <View style={styles.optionRow}>
            {INTENSITY_OPTIONS.map(opt => {
              const isActive = intensity === opt;
              const optColor = opt === 'Low' ? colors.accent : opt === 'Moderate' ? colors.warning : colors.error;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setIntensity(opt)}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: isActive ? optColor + '22' : colors.glass,
                      borderColor: isActive ? optColor : 'transparent',
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, { color: isActive ? optColor : colors.textMuted }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.md }]}>Frequency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.optionRow}>
              {FREQUENCY_OPTIONS.map(opt => {
                const isActive = frequency === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setFrequency(opt)}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: isActive ? colors.accent1 + '22' : colors.glass,
                        borderColor: isActive ? colors.accent1 : 'transparent',
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text style={[styles.optionText, { color: isActive ? colors.accent1 : colors.textMuted }]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.md }]}>Duration</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.optionRow}>
              {DURATION_OPTIONS.map(opt => {
                const isActive = duration === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setDuration(opt)}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: isActive ? colors.accent2 + '22' : colors.glass,
                        borderColor: isActive ? colors.accent2 : 'transparent',
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text style={[styles.optionText, { color: isActive ? colors.accent2 : colors.textMuted }]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </GlassCard>

        {/* Drills */}
        <GlassCard>
          <View style={styles.drillsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Drills</Text>
            <Pressable
              onPress={addDrill}
              style={[styles.addDrillBtn, { backgroundColor: colors.accent1 + '18' }]}
            >
              <Ionicons name="add" size={16} color={colors.accent1} />
              <Text style={[styles.addDrillText, { color: colors.accent1 }]}>Add Drill</Text>
            </Pressable>
          </View>

          {drills.length === 0 ? (
            <View style={styles.drillsEmpty}>
              <Text style={[styles.drillsEmptyText, { color: colors.textInactive }]}>
                No drills added yet. Add specific exercises for this program.
              </Text>
            </View>
          ) : (
            drills.map((drill, index) => (
              <View key={drill.id} style={[styles.drillCard, { borderColor: colors.glassBorder }]}>
                <View style={styles.drillHeaderRow}>
                  <Text style={[styles.drillNumber, { color: colors.accent1 }]}>#{index + 1}</Text>
                  <Pressable onPress={() => removeDrill(drill.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.error} />
                  </Pressable>
                </View>
                <TextInput
                  value={drill.name}
                  onChangeText={v => updateDrill(drill.id, 'name', v)}
                  placeholder="Drill name"
                  placeholderTextColor={colors.textInactive}
                  style={[styles.drillNameInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                />
                <View style={styles.drillPrescription}>
                  <View style={styles.rxField}>
                    <Text style={[styles.rxLabel, { color: colors.textMuted }]}>Sets</Text>
                    <TextInput
                      value={drill.sets}
                      onChangeText={v => updateDrill(drill.id, 'sets', v)}
                      keyboardType="number-pad"
                      style={[styles.rxInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                    />
                  </View>
                  <View style={styles.rxField}>
                    <Text style={[styles.rxLabel, { color: colors.textMuted }]}>Reps</Text>
                    <TextInput
                      value={drill.reps}
                      onChangeText={v => updateDrill(drill.id, 'reps', v)}
                      keyboardType="number-pad"
                      style={[styles.rxInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                    />
                  </View>
                  <View style={styles.rxField}>
                    <Text style={[styles.rxLabel, { color: colors.textMuted }]}>Rest</Text>
                    <TextInput
                      value={drill.rest}
                      onChangeText={v => updateDrill(drill.id, 'rest', v)}
                      style={[styles.rxInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                    />
                  </View>
                </View>
                <TextInput
                  value={drill.notes}
                  onChangeText={v => updateDrill(drill.id, 'notes', v)}
                  placeholder="Coaching cues / notes..."
                  placeholderTextColor={colors.textInactive}
                  style={[styles.drillNotesInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                />
              </View>
            ))
          )}
        </GlassCard>

        {/* Coach Notes */}
        <GlassCard>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Coach Notes</Text>
          <TextInput
            value={coachNotes}
            onChangeText={setCoachNotes}
            placeholder="Additional notes for the player..."
            placeholderTextColor={colors.textInactive}
            multiline
            numberOfLines={3}
            style={[styles.textAreaInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
          />
        </GlassCard>

        {/* Summary */}
        {name.trim() && (
          <GlassCard>
            <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryEmoji}>{selectedCat?.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryName, { color: colors.textOnDark }]}>{name}</Text>
                <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                  {selectedCat?.label} · {intensity} · {frequency} · {duration}
                </Text>
                <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                  {drills.length} drill{drills.length !== 1 ? 's' : ''} · For {playerName.split(' ')[0]}
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={saving || !name.trim()}
          style={[
            styles.saveButton,
            {
              backgroundColor: saving || !name.trim() ? colors.textInactive : colors.accent1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.saveButtonText}>Assign to {playerName.split(' ')[0]}</Text>
            </>
          )}
        </Pressable>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: layout.screenMargin,
    gap: spacing.md,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  contextText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
  },
  textAreaInput: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  categoryEmoji: { fontSize: 14 },
  categoryLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  optionText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },

  // Drills
  drillsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  addDrillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  addDrillText: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  drillsEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  drillsEmptyText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },
  drillCard: {
    borderWidth: 0.5,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 8,
  },
  drillHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drillNumber: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
  },
  drillNameInput: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
  },
  drillPrescription: {
    flexDirection: 'row',
    gap: 8,
  },
  rxField: {
    flex: 1,
    gap: 2,
  },
  rxLabel: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    textTransform: 'uppercase',
  },
  rxInput: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  drillNotesInput: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  summaryEmoji: { fontSize: 28 },
  summaryName: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  summaryMeta: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },

  // Save
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
});
