/**
 * Event Edit Screen — Full-page event editor
 *
 * Opens when tapping the pencil icon on a calendar event block.
 * Editable: title, date, start/end time, intensity, notes.
 * Type badge is display-only (non-editable).
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  borderRadius,
  layout,
  fontFamily,
} from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { updateCalendarEvent, deleteCalendarEvent } from '../services/api';
import { useScheduleRules } from '../hooks/useScheduleRules';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventEditScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'EventEdit'>;
  route: RouteProp<MainStackParamList, 'EventEdit'>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  training: { label: 'Training', icon: 'barbell-outline', color: colors.accent },
  match: { label: 'Match', icon: 'trophy-outline', color: colors.info },
  study_block: { label: 'Study', icon: 'book-outline', color: colors.info },
  exam: { label: 'Exam', icon: 'document-text-outline', color: colors.warning },
  recovery: { label: 'Recovery', icon: 'leaf-outline', color: colors.accent },
  other: { label: 'Other', icon: 'ellipsis-horizontal', color: colors.textDisabled },
};

const INTENSITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateDisplay(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function computeDurationLabel(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  if (mins < 60) return `(${mins} min)`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `(${hrs}h ${rem}m)` : `(${hrs}h)`;
}

function getDateOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 7); // 7 days back, 22 days forward
    const val = d.toISOString().split('T')[0];
    return { value: val, label: formatDateDisplay(val) };
  });
}

// ---------------------------------------------------------------------------
// Time Picker Modal (reused pattern from AddEventScreen)
// ---------------------------------------------------------------------------

function TimePickerModal({
  visible,
  title,
  initialTime,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  initialTime: string;
  onSelect: (time: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [h, m] = (initialTime || '09:00').split(':');
  const [hour, setHour] = useState(h || '09');
  const [minute, setMinute] = useState(m || '00');
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  // Reset when opened
  useEffect(() => {
    if (visible && initialTime) {
      const [ih, im] = initialTime.split(':');
      setHour(ih || '09');
      setMinute(im || '00');
    }
  }, [visible, initialTime]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={ms.title}>{title}</Text>

          <View style={ms.pickerRow}>
            <View style={ms.pickerCol}>
              <Text style={ms.pickerLabel}>Hour</Text>
              <FlatList
                data={HOURS}
                keyExtractor={(item) => item}
                style={ms.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setHour(item)}
                    style={[ms.option, item === hour && ms.optionActive]}
                  >
                    <Text style={[ms.optionText, item === hour && ms.optionTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>

            <Text style={ms.colon}>:</Text>

            <View style={ms.pickerCol}>
              <Text style={ms.pickerLabel}>Min</Text>
              <FlatList
                data={MINUTES}
                keyExtractor={(item) => item}
                style={ms.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setMinute(item)}
                    style={[ms.option, item === minute && ms.optionActive]}
                  >
                    <Text style={[ms.optionText, item === minute && ms.optionTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          </View>

          <View style={ms.actions}>
            <Pressable onPress={onClose} style={ms.cancelBtn}>
              <Text style={ms.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSelect(`${hour}:${minute}`);
                onClose();
              }}
              style={ms.confirmBtn}
            >
              <Text style={ms.confirmText}>Set</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventEditScreen({ navigation, route }: EventEditScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  const params = route.params;
  const typeConf = TYPE_CONFIG[params.type] || TYPE_CONFIG.other;

  // ── Editable state ──
  const [name, setName] = useState(params.name);
  const [date, setDate] = useState(params.date);
  const [startTime, setStartTime] = useState(params.startTime);
  const [endTime, setEndTime] = useState(params.endTime);
  const [notes, setNotes] = useState(params.notes || '');
  const [intensity, setIntensity] = useState(params.intensity || 'medium');
  const [saving, setSaving] = useState(false);

  // ── Picker visibility ──
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const durationLabel = useMemo(
    () => computeDurationLabel(startTime, endTime),
    [startTime, endTime],
  );

  const showIntensity = params.type === 'training' || params.type === 'match';

  // ── Linked Programs ──
  const linkedPrograms = (params as any).linkedPrograms ?? [];
  const { rules, update: updateRules } = useScheduleRules();

  const handleUnlinkProgram = useCallback(async (programId: string) => {
    const categories = rules?.preferences?.training_categories ?? [];
    const updated = categories.map((cat: any) => ({
      ...cat,
      linkedPrograms: (cat.linkedPrograms ?? []).filter(
        (lp: any) => lp.programId !== programId
      ),
    }));
    try {
      await updateRules({ training_categories: updated });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigate back to refresh
      navigation.goBack();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert('Failed to unlink: ' + (e?.message || ''));
      else Alert.alert('Error', 'Failed to unlink program.');
    }
  }, [rules, updateRules, navigation]);

  // ── Handlers ──

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateCalendarEvent(params.eventId, {
        name: name !== params.name ? name : undefined,
        date: date !== params.date ? date : undefined,
        startTime: startTime !== params.startTime ? startTime : undefined,
        endTime: endTime !== params.endTime ? endTime : undefined,
        notes: notes !== (params.notes || '') ? notes : undefined,
        intensity: intensity !== (params.intensity || 'medium') ? intensity : undefined,
      });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [saving, params, name, date, startTime, endTime, notes, intensity, navigation]);

  const handleDelete = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Alert.alert('Delete Event', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCalendarEvent(params.eventId);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Could not delete event.');
          }
        },
      },
    ]);
  }, [name, params.eventId, navigation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.headerBack}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textOnDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Event</Text>
          <Pressable onPress={handleDelete} hitSlop={12}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ Type Badge (non-editable) ═══ */}
          <View style={[styles.typeBadge, { backgroundColor: typeConf.color + '20' }]}>
            <Ionicons name={typeConf.icon} size={16} color={typeConf.color} />
            <Text style={[styles.typeBadgeText, { color: typeConf.color }]}>
              {typeConf.label}
            </Text>
          </View>

          {/* ═══ Title Input ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={name}
              onChangeText={setName}
              placeholder="Event name"
              placeholderTextColor={colors.textInactive}
              returnKeyType="done"
            />
          </View>

          {/* ═══ Date & Time ═══ */}
          <View style={styles.group}>
            {/* Date row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.settingIconRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent1} />
                <Text style={styles.settingLabel}>Date</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatDateDisplay(date)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* Start time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowStartPicker(true)}
            >
              <View style={styles.settingIconRow}>
                <Ionicons name="time-outline" size={18} color={colors.accent1} />
                <Text style={styles.settingLabel}>Starts</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatTime12h(startTime)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* End time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowEndPicker(true)}
            >
              <View style={styles.settingIconRow}>
                <Ionicons name="time-outline" size={18} color={colors.accent2} />
                <Text style={styles.settingLabel}>Ends</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatTime12h(endTime)}</Text>
                {durationLabel ? (
                  <Text style={styles.durationLabel}>{durationLabel}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>
          </View>

          {/* ═══ Intensity (training/match only) ═══ */}
          {showIntensity && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Intensity</Text>
              <View style={styles.intensityRow}>
                {INTENSITY_OPTIONS.map((opt) => {
                  const active = intensity === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        setIntensity(opt.key);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      style={[
                        styles.intensityPill,
                        active && styles.intensityPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.intensityPillText,
                          active && styles.intensityPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ═══ Notes ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              placeholderTextColor={colors.textInactive}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* ═══ Linked Programs ═══ */}
          {params.type === 'training' && linkedPrograms.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Linked Programs</Text>
              {linkedPrograms.map((lp: any) => (
                <View key={lp.programId} style={[styles.linkedProgramRow, { backgroundColor: colors.glass }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkedProgramName, { color: colors.textOnDark }]}>{lp.name}</Text>
                    {lp.category && (
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textMuted }}>{lp.category}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm(`Unlink "${lp.name}" from this training?`)) {
                          handleUnlinkProgram(lp.programId);
                        }
                      } else {
                        Alert.alert('Unlink Program', `Remove "${lp.name}" from this training?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Unlink', style: 'destructive', onPress: () => handleUnlinkProgram(lp.programId) },
                        ]);
                      }
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* ═══ Save Button ═══ */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </ScrollView>

        {/* ─── Time Picker Modals ─── */}
        <TimePickerModal
          visible={showStartPicker}
          title="Start Time"
          initialTime={startTime}
          onSelect={setStartTime}
          onClose={() => setShowStartPicker(false)}
          colors={colors}
        />
        <TimePickerModal
          visible={showEndPicker}
          title="End Time"
          initialTime={endTime}
          onSelect={setEndTime}
          onClose={() => setShowEndPicker(false)}
          colors={colors}
        />

        {/* Date picker modal */}
        <Modal visible={showDatePicker} transparent animationType="slide">
          <Pressable style={ms.overlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={ms.title}>Select Date</Text>
              <FlatList
                data={dateOptions}
                keyExtractor={(item) => item.value}
                style={{ maxHeight: 350 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setDate(item.value);
                      setShowDatePicker(false);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    style={[ms.dateOption, item.value === date && ms.dateOptionActive]}
                  >
                    <Text style={[ms.dateOptionLabel, item.value === date && ms.dateOptionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={ms.dateOptionValue}>{item.value}</Text>
                    {item.value === date && (
                      <Ionicons name="checkmark" size={18} color={colors.accent1} />
                    )}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles Factory
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.glassBorder,
    },
    headerBack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
    },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
    },

    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      marginBottom: spacing.lg,
    },
    typeBadgeText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.3,
    },

    group: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: spacing.md,
    },
    groupLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    linkedProgramRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: borderRadius.md,
      marginBottom: 6,
    },
    linkedProgramName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.glassBorder,
      marginVertical: 10,
      marginHorizontal: -16,
      marginLeft: 0,
    },

    titleInput: {
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      color: colors.textOnDark,
      paddingVertical: 4,
    },

    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      minHeight: 36,
    },
    settingIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    settingLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },
    settingValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    settingValue: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.accent1,
    },
    durationLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },

    intensityRow: {
      flexDirection: 'row',
      gap: 8,
    },
    intensityPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
    },
    intensityPillActive: {
      backgroundColor: colors.accent1,
      borderColor: colors.accent1,
    },
    intensityPillText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textMuted,
    },
    intensityPillTextActive: {
      color: colors.textPrimary,
      fontFamily: fontFamily.semiBold,
    },

    notesInput: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      minHeight: 100,
      paddingVertical: 4,
    },

    saveButton: {
      backgroundColor: colors.accent1,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    saveButtonDisabled: {
      opacity: 0.45,
    },
    saveButtonText: {
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
  });
}

// ---------------------------------------------------------------------------
// Modal Styles Factory (matches AddEventScreen pattern)
// ---------------------------------------------------------------------------

function createModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.backgroundElevated,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
      paddingHorizontal: layout.screenMargin,
      maxHeight: '55%',
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    pickerCol: {
      alignItems: 'center',
      width: 80,
    },
    pickerLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    list: {
      maxHeight: 200,
    },
    option: {
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 2,
    },
    optionActive: {
      backgroundColor: colors.accent1 + '20',
    },
    optionText: {
      fontFamily: fontFamily.medium,
      fontSize: 18,
      color: colors.textMuted,
    },
    optionTextActive: {
      color: colors.accent1,
      fontFamily: fontFamily.bold,
    },
    colon: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
      color: colors.textOnDark,
      marginTop: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.glass,
      alignItems: 'center',
    },
    cancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textMuted,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.accent1,
      alignItems: 'center',
    },
    confirmText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    dateOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      marginBottom: 2,
    },
    dateOptionActive: {
      backgroundColor: colors.accent1 + '15',
    },
    dateOptionLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textOnDark,
      flex: 1,
    },
    dateOptionLabelActive: {
      color: colors.accent1,
      fontFamily: fontFamily.bold,
    },
    dateOptionValue: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginRight: spacing.sm,
    },
  });
}
