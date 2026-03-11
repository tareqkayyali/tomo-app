/**
 * Add Event Screen — Apple Calendar-inspired grouped form
 *
 * Fields: name, type, sport, date, startTime, endTime, intensity, notes
 * Fully themed for dark/light mode.
 */

import React, { useState, useCallback, useMemo } from 'react';
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
import { createCalendarEvent } from '../services/api';
import { useSportContext } from '../hooks/useSportContext';
import type { ActiveSport } from '../hooks/useSportContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { IntensityLevel, EventSport } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AddEventScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'AddEvent'>;
};

type EventType = 'training' | 'match' | 'recovery' | 'other';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPES: Array<{
  key: EventType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'training', label: 'Training', icon: 'barbell-outline' },
  { key: 'match', label: 'Match', icon: 'trophy-outline' },
  { key: 'recovery', label: 'Recovery', icon: 'leaf-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const SPORT_OPTIONS: Array<{
  key: EventSport;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { key: 'football', label: 'Football', icon: 'football-outline', color: '#2ECC71' },
  { key: 'padel', label: 'Padel', icon: 'tennisball-outline', color: '#3498DB' },
  { key: 'general', label: 'General', icon: 'ellipsis-horizontal', color: '#AAAAAA' },
];

const INTENSITY_OPTIONS: Array<{
  key: IntensityLevel;
  label: string;
  color: string;
}> = [
  { key: 'REST', label: 'Rest', color: '#8E8E93' },
  { key: 'LIGHT', label: 'Light', color: '#2ECC71' },
  { key: 'MODERATE', label: 'Moderate', color: '#FF9500' },
  { key: 'HARD', label: 'Hard', color: '#FF453A' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr: string): string {
  const today = getTodayStr();
  const tomorrow = getDateStr(1);
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function getDateOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 14 }, (_, i) => {
    const val = getDateStr(i);
    return { value: val, label: formatDateDisplay(val) };
  });
}

// ---------------------------------------------------------------------------
// Time Picker Modal (themed)
// ---------------------------------------------------------------------------

function TimePickerModal({
  visible,
  title,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  onSelect: (time: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const ms = useMemo(() => createModalStyles(colors), [colors]);

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

export function AddEventScreen({ navigation }: AddEventScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { activeSport } = useSportContext();
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>('training');
  const [sport, setSport] = useState<EventSport>(activeSport === 'football' ? 'football' : 'padel');
  const [date, setDate] = useState(getTodayStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [intensity, setIntensity] = useState<IntensityLevel | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter an event name.');
      return;
    }

    setSubmitting(true);
    try {
      await createCalendarEvent({
        name: name.trim(),
        type: eventType,
        sport: (eventType === 'training' || eventType === 'match') ? sport : 'general',
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        intensity: intensity || undefined,
        notes: notes.trim() || undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not create event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [name, eventType, sport, date, startTime, endTime, intensity, notes, navigation]);

  const showSport = eventType === 'training' || eventType === 'match';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.headerCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New Event</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !name.trim()}
            hitSlop={12}
          >
            <Text
              style={[
                styles.headerAdd,
                (!name.trim() || submitting) && styles.headerAddDisabled,
              ]}
            >
              Add
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ Group 1: Title ═══ */}
          <View style={styles.group}>
            <TextInput
              style={styles.titleInput}
              value={name}
              onChangeText={setName}
              placeholder="Title"
              placeholderTextColor={colors.textInactive}
              autoFocus
            />
          </View>

          {/* ═══ Group 2: Type + Sport ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Type</Text>
            <View style={styles.chipRow}>
              {EVENT_TYPES.map((t) => {
                const active = eventType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => {
                      setEventType(t.key);
                      if (t.key === 'recovery' || t.key === 'other') setSport('general');
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={15}
                      color={active ? '#FFFFFF' : colors.textMuted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {showSport && (
              <>
                <View style={styles.groupDivider} />
                <Text style={styles.groupLabel}>Sport</Text>
                <View style={styles.chipRow}>
                  {SPORT_OPTIONS.map((opt) => {
                    const active = sport === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          setSport(opt.key);
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        style={[
                          styles.chip,
                          active && { backgroundColor: opt.color, borderColor: opt.color },
                        ]}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={14}
                          color={active ? '#FFFFFF' : colors.textMuted}
                        />
                        <Text style={[styles.chipText, active && { color: '#FFFFFF' }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {/* ═══ Group 3: Date & Time ═══ */}
          <View style={styles.group}>
            {/* Date row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.settingLabel}>Date</Text>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatDateDisplay(date)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* Start time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowStartTimePicker(true)}
            >
              <Text style={styles.settingLabel}>Starts</Text>
              <View style={styles.settingValueWrap}>
                <Text style={[styles.settingValue, !startTime && styles.settingPlaceholder]}>
                  {startTime ? formatTime12h(startTime) : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* End time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowEndTimePicker(true)}
            >
              <Text style={styles.settingLabel}>Ends</Text>
              <View style={styles.settingValueWrap}>
                <Text style={[styles.settingValue, !endTime && styles.settingPlaceholder]}>
                  {endTime ? formatTime12h(endTime) : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>
          </View>

          {/* ═══ Group 4: Intensity ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Intensity</Text>
            <View style={styles.chipRow}>
              {INTENSITY_OPTIONS.map((opt) => {
                const active = intensity === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      setIntensity(active ? null : opt.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[
                      styles.chip,
                      active && { backgroundColor: opt.color, borderColor: opt.color },
                    ]}
                  >
                    <View style={[styles.intensityDot, { backgroundColor: active ? '#FFFFFF' : opt.color }]} />
                    <Text style={[styles.chipText, active && { color: '#FFFFFF' }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ═══ Group 5: Notes ═══ */}
          <View style={styles.group}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={colors.textInactive}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* ─── Modals ─── */}
        <TimePickerModal
          visible={showStartTimePicker}
          title="Start Time"
          onSelect={setStartTime}
          onClose={() => setShowStartTimePicker(false)}
          colors={colors}
        />
        <TimePickerModal
          visible={showEndTimePicker}
          title="End Time"
          onSelect={setEndTime}
          onClose={() => setShowEndTimePicker(false)}
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
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setDate(item.value);
                      setShowDatePicker(false);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
// Styles Factory (themed)
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Header ───────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.glassBorder,
    },
    headerCancel: {
      fontFamily: fontFamily.regular,
      fontSize: 17,
      color: colors.accent1,
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
    },
    headerAdd: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.accent1,
    },
    headerAddDisabled: {
      opacity: 0.35,
    },

    // ── Scroll ───────────────────────────────────────────────────────
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
    },

    // ── Groups (Apple-style grouped cells) ───────────────────────────
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
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.glassBorder,
      marginVertical: 10,
      marginHorizontal: -16,
      marginLeft: 0,
    },

    // ── Title input ──────────────────────────────────────────────────
    titleInput: {
      fontFamily: fontFamily.regular,
      fontSize: 17,
      color: colors.textOnDark,
      paddingVertical: 4,
      minHeight: 36,
    },

    // ── Setting rows (Date/Time) ─────────────────────────────────────
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      minHeight: 36,
    },
    settingLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },
    settingValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    settingValue: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.accent1,
    },
    settingPlaceholder: {
      color: colors.textInactive,
    },

    // ── Chips ────────────────────────────────────────────────────────
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
    },
    chipActive: {
      backgroundColor: colors.accent1,
      borderColor: colors.accent1,
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    chipTextActive: {
      color: '#FFFFFF',
    },
    intensityDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },

    // ── Notes ────────────────────────────────────────────────────────
    notesInput: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      minHeight: 80,
      paddingVertical: 4,
    },
  });
}

// ---------------------------------------------------------------------------
// Modal Styles Factory (themed)
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
      color: '#FFFFFF',
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
