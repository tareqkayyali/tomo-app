/**
 * Recommend Event Screen — Coach/Parent sends a suggestion to a player.
 *
 * Similar form to AddEventScreen but creates a suggestion instead of a direct event.
 * Event types are filtered by allowedTypes route param.
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
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  borderRadius,
  layout,
  fontFamily,
  screenBg,
} from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { createSuggestion } from '../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IntensityLevel, EventSport } from '../types';
import { colors } from '../theme/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// This screen can be reached from both Coach and Parent stacks.
// We define a generic param type here.
type RecommendEventParams = {
  RecommendEvent: {
    playerId: string;
    playerName: string;
    allowedTypes: string[];
  };
};

type Props = NativeStackScreenProps<RecommendEventParams, 'RecommendEvent'>;

type EventType = 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_EVENT_TYPES: Array<{
  key: EventType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'training', label: 'Training', icon: 'barbell-outline' },
  { key: 'match', label: 'Match', icon: 'trophy-outline' },
  { key: 'study_block', label: 'Study', icon: 'book-outline' },
  { key: 'exam', label: 'Exam', icon: 'document-text-outline' },
  { key: 'recovery', label: 'Recovery', icon: 'leaf-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const SPORT_OPTIONS: Array<{
  key: EventSport;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { key: 'football', label: 'Football', icon: 'football-outline', color: colors.accent },
  { key: 'padel', label: 'Padel', icon: 'tennisball-outline', color: colors.info },
  { key: 'general', label: 'General', icon: 'ellipsis-horizontal', color: colors.textSecondary },
];

const INTENSITY_OPTIONS: Array<{
  key: IntensityLevel;
  label: string;
  color: string;
}> = [
  { key: 'REST', label: 'Rest', color: colors.textSecondary },
  { key: 'LIGHT', label: 'Light', color: colors.accent },
  { key: 'MODERATE', label: 'Moderate', color: colors.warning },
  { key: 'HARD', label: 'Hard', color: colors.error },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const DURATION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2.5 hours' },
  { value: 180, label: '3 hours' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
// Time Picker Modal
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

export function RecommendEventScreen({ navigation, route }: Props) {
  const { playerId, playerName, allowedTypes } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Filter event types based on what the caller role allows
  const eventTypes = useMemo(
    () => ALL_EVENT_TYPES.filter((et) => allowedTypes.includes(et.key)),
    [allowedTypes],
  );

  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>(
    (eventTypes[0]?.key as EventType) || 'training',
  );
  const [sport, setSport] = useState<EventSport>('football');
  const [date, setDate] = useState(getTodayStr());
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<IntensityLevel | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  const showSport = eventType === 'training' || eventType === 'match' || eventType === 'recovery';
  const showIntensity = eventType === 'training' || eventType === 'match';

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter an event name.');
      } else {
        Alert.alert('Missing Name', 'Please enter an event name.');
      }
      return;
    }

    setSubmitting(true);
    try {
      const computedEndTime =
        startTime && duration ? addMinutesToTime(startTime, duration) : undefined;

      await createSuggestion({
        playerId,
        suggestionType: 'calendar_event',
        title: name.trim(),
        payload: {
          type: eventType,
          date,
          startTime: startTime || undefined,
          endTime: computedEndTime,
          duration: duration || undefined,
          intensity: showIntensity ? intensity : undefined,
          sport: showSport ? sport : 'general',
          notes: notes.trim() || undefined,
        },
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (Platform.OS === 'web') {
        window.alert(`${playerName} will see your recommendation and can accept or decline it.`);
        navigation.goBack();
      } else {
        Alert.alert(
          'Recommendation Sent',
          `${playerName} will see your recommendation and can accept or decline it.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not send recommendation. Please try again.');
      } else {
        Alert.alert('Error', 'Could not send recommendation. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name, eventType, sport, date, startTime, duration, intensity, notes,
    playerId, playerName, showSport, showIntensity, navigation,
  ]);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <PlayerScreen
      label="RECOMMEND"
      title="Suggest event"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Banner */}
          <View style={styles.banner}>
            <SmartIcon name="paper-plane-outline" size={18} color={colors.accent1} />
            <Text style={[styles.bannerText, { color: colors.textOnDark }]}>
              Recommending for {playerName.split(' ')[0]}
            </Text>
          </View>

          {/* Event Name */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sprint Drills, Math Revision"
              placeholderTextColor={colors.textInactive}
            />
          </View>

          {/* Event Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              {eventTypes.map((et) => (
                <Pressable
                  key={et.key}
                  onPress={() => setEventType(et.key)}
                  style={[
                    styles.chip,
                    eventType === et.key && { backgroundColor: colors.accent1 },
                  ]}
                >
                  <SmartIcon
                    name={et.icon}
                    size={16}
                    color={eventType === et.key ? colors.textPrimary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      eventType === et.key && { color: colors.textPrimary },
                    ]}
                  >
                    {et.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Sport (training/match/recovery only) */}
          {showSport && (
            <View style={styles.section}>
              <Text style={styles.label}>Sport</Text>
              <View style={styles.chipRow}>
                {SPORT_OPTIONS.map((s) => (
                  <Pressable
                    key={s.key}
                    onPress={() => setSport(s.key)}
                    style={[
                      styles.chip,
                      sport === s.key && { backgroundColor: s.color + '33', borderColor: s.color },
                    ]}
                  >
                    <SmartIcon
                      name={s.icon}
                      size={16}
                      color={sport === s.key ? s.color : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        sport === s.key && { color: s.color },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.label}>Date</Text>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.pickerButton}>
              <SmartIcon name="calendar-outline" size={18} color={colors.textMuted} />
              <Text style={styles.pickerButtonText}>
                {formatDateDisplay(date)}
              </Text>
            </Pressable>
          </View>

          {/* Start Time */}
          <View style={styles.section}>
            <Text style={styles.label}>Start Time</Text>
            <Pressable onPress={() => setShowStartTimePicker(true)} style={styles.pickerButton}>
              <SmartIcon name="time-outline" size={18} color={colors.textMuted} />
              <Text style={styles.pickerButtonText}>
                {startTime ? formatTime12h(startTime) : 'Select time'}
              </Text>
            </Pressable>
          </View>

          {/* Duration */}
          <View style={styles.section}>
            <Text style={styles.label}>Duration</Text>
            <Pressable onPress={() => setShowDurationPicker(true)} style={styles.pickerButton}>
              <SmartIcon name="hourglass-outline" size={18} color={colors.textMuted} />
              <Text style={styles.pickerButtonText}>
                {duration
                  ? DURATION_OPTIONS.find((d) => d.value === duration)?.label || `${duration} min`
                  : 'Select duration'}
              </Text>
            </Pressable>
          </View>

          {/* Intensity (training/match only) */}
          {showIntensity && (
            <View style={styles.section}>
              <Text style={styles.label}>Intensity</Text>
              <View style={styles.chipRow}>
                {INTENSITY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setIntensity(opt.key)}
                    style={[
                      styles.chip,
                      intensity === opt.key && { backgroundColor: opt.color + '33', borderColor: opt.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        intensity === opt.key && { color: opt.color },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes for the player..."
              placeholderTextColor={colors.textInactive}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: colors.accent1, opacity: pressed || submitting ? 0.7 : 1 },
            ]}
          >
            <SmartIcon name="paper-plane" size={18} color={colors.textPrimary} />
            <Text style={styles.submitText}>
              {submitting ? 'Sending…' : 'Send Recommendation'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Modals ─── */}

      <TimePickerModal
        visible={showStartTimePicker}
        title="Start Time"
        onSelect={setStartTime}
        onClose={() => setShowStartTimePicker(false)}
        colors={colors}
      />

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <Pressable style={ms.overlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={ms.title}>Select Date</Text>
            <FlatList
              data={dateOptions}
              keyExtractor={(item) => item.value}
              style={ms.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setDate(item.value);
                    setShowDatePicker(false);
                  }}
                  style={[ms.option, item.value === date && ms.optionActive]}
                >
                  <Text style={[ms.optionText, item.value === date && ms.optionTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Duration Picker Modal */}
      <Modal visible={showDurationPicker} transparent animationType="slide">
        <Pressable style={ms.overlay} onPress={() => setShowDurationPicker(false)}>
          <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={ms.title}>Duration</Text>
            <FlatList
              data={DURATION_OPTIONS}
              keyExtractor={(item) => String(item.value)}
              style={ms.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setDuration(item.value);
                    setShowDurationPicker(false);
                  }}
                  style={[ms.option, item.value === duration && ms.optionActive]}
                >
                  <Text style={[ms.optionText, item.value === duration && ms.optionTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </PlayerScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: screenBg,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: layout.screenMargin,
      paddingBottom: 40,
      gap: spacing.md,
    },

    // Banner
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.accent1 + '15',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.accent1 + '33',
    },
    bannerText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },

    // Section
    section: {
      gap: spacing.xs,
    },
    label: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    // Input
    input: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notesInput: {
      minHeight: 80,
    },

    // Chip row
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },

    // Picker button
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerButtonText: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },

    // Submit
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: borderRadius.md,
      marginTop: spacing.md,
    },
    submitText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
  });
}

function createModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textOnDark,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    pickerCol: {
      width: 80,
      alignItems: 'center',
    },
    pickerLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 4,
    },
    colon: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
      marginHorizontal: 4,
    },
    list: {
      maxHeight: 200,
    },
    option: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
    },
    optionActive: {
      backgroundColor: colors.accent1 + '22',
    },
    optionText: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },
    optionTextActive: {
      fontFamily: fontFamily.semiBold,
      color: colors.accent1,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      gap: spacing.md,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: borderRadius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textMuted,
    },
    confirmBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accent1,
    },
    confirmText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
  });
}
