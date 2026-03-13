/**
 * Edit Profile Screen
 * Edit user name, sport, region, team, study info, and training schedule
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Card, ErrorState } from '../components';
import { SportSelector } from '../components/SportSelector';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import { updateUser } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useHealthKit } from '../hooks/useHealthKit';
import type { Sport, ExamEntry, ExamType, TrainingPreferences } from '../types';

// ── Constants ────────────────────────────────────────────────────────

const PRESET_SUBJECTS = [
  'Math', 'Physics', 'English', 'Biology', 'History', 'Chemistry', 'Computer Science',
];

const EXAM_TYPES: ExamType[] = ['Quiz', 'Mid-term', 'Final', 'Essay', 'Presentation'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function generateNextDays(count: number): { label: string; value: string }[] {
  const days: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const value = `${yyyy}-${mm}-${dd}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push({ label, value });
  }
  return days;
}

const NEXT_60_DAYS = generateNextDays(60);

// ── Component ────────────────────────────────────────────────────────

export function EditProfileScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { profile, refreshProfile } = useAuth();

  // Basic profile fields
  const [name, setName] = useState(profile?.name || '');
  const [sport, setSport] = useState<Sport>(profile?.sport || 'football');
  const [region, setRegion] = useState(profile?.region || '');
  const [teamId, setTeamId] = useState(profile?.teamId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Study fields
  const [subjects, setSubjects] = useState<string[]>(profile?.studySubjects || []);
  const [customSubject, setCustomSubject] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [exams, setExams] = useState<ExamEntry[]>(profile?.examSchedule || []);
  const [showAddExam, setShowAddExam] = useState(false);
  const [newExamSubject, setNewExamSubject] = useState('');
  const [newExamType, setNewExamType] = useState<ExamType>('Final');
  const [newExamDate, setNewExamDate] = useState('');

  // Training fields
  const initTP = profile?.trainingPreferences;
  const [gymSessions, setGymSessions] = useState(initTP?.gymSessionsPerWeek ?? 0);
  const [gymFixedDays, setGymFixedDays] = useState<number[]>(initTP?.gymFixedDays || []);
  const [clubSessions, setClubSessions] = useState(initTP?.clubSessionsPerWeek ?? 0);
  const [clubFixedDays, setClubFixedDays] = useState<number[]>(initTP?.clubFixedDays || []);

  const {
    isModuleAvailable: hkModuleAvailable,
    isConnected: hkConnected,
    isLoading: hkLoading,
    error: hkError,
    connect: hkConnect,
    disconnect: hkDisconnect,
  } = useHealthKit();

  // ── Subject helpers ─────────────────────────────────────────────────

  const toggleSubject = useCallback((subj: string) => {
    setSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj],
    );
  }, []);

  const addCustomSubject = useCallback(() => {
    const trimmed = customSubject.trim();
    if (trimmed && !subjects.includes(trimmed)) {
      setSubjects((prev) => [...prev, trimmed]);
    }
    setCustomSubject('');
    setShowCustomInput(false);
  }, [customSubject, subjects]);

  // ── Exam helpers ────────────────────────────────────────────────────

  const addExam = useCallback(() => {
    if (!newExamSubject || !newExamDate) {
      Alert.alert('Missing Info', 'Please select a subject and date for the exam.');
      return;
    }
    // Check for duplicate (same subject + same date)
    const duplicate = exams.some((e) => e.subject === newExamSubject && e.examDate === newExamDate);
    if (duplicate) {
      Alert.alert('Duplicate', 'You already have an exam for this subject on this date.');
      return;
    }
    const entry: ExamEntry = {
      id: Date.now().toString(),
      subject: newExamSubject,
      examType: newExamType,
      examDate: newExamDate,
    };
    setExams((prev) => [...prev, entry]);
    setNewExamSubject('');
    setNewExamType('Final');
    setNewExamDate('');
    setShowAddExam(false);
  }, [newExamSubject, newExamType, newExamDate]);

  const removeExam = useCallback((id: string) => {
    setExams((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Training day toggle ─────────────────────────────────────────────

  const toggleDay = useCallback(
    (arr: number[], setArr: React.Dispatch<React.SetStateAction<number[]>>, day: number) => {
      setArr(arr.includes(day) ? arr.filter((d) => d !== day) : [...arr, day]);
    },
    [],
  );

  // ── Stepper helpers ─────────────────────────────────────────────────

  const increment = (val: number, max: number) => Math.min(val + 1, max);
  const decrement = (val: number) => Math.max(val - 1, 0);

  // ── Save ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const trainingPreferences: TrainingPreferences = {
        gymSessionsPerWeek: gymSessions,
        gymFixedDays,
        clubSessionsPerWeek: clubSessions,
        clubFixedDays,
      };

      await updateUser({
        name: name.trim(),
        displayName: name.trim(),
        sport,
        region: region.trim() || undefined,
        teamId: teamId.trim() || undefined,
        studySubjects: subjects,
        examSchedule: exams,
        trainingPreferences,
      } as Parameters<typeof updateUser>[0]);
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => navigation.goBack(), 1000);
    } catch (err) {
      setError((err as Error).message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error !== '' && (
          <ErrorState message={error} compact />
        )}

        {success && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.successText}>Profile updated!</Text>
          </View>
        )}

        <Card style={styles.card}>
          <Input
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.sportLabel}>Sport</Text>
          <SportSelector
            selected={sport}
            onSelect={(s) => setSport(s as Sport)}
          />
          {sport === 'padel' && (
            <View style={styles.padelEnabledRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.padelEnabledText}>
                Padel features enabled — DNA Card, Shot Mastery, Rating Pathway
              </Text>
            </View>
          )}
          <View style={{ height: spacing.md }} />

          <Input
            label="Region (optional)"
            placeholder="e.g. US-East, Europe"
            value={region}
            onChangeText={setRegion}
          />

          <Input
            label="Team ID (optional)"
            placeholder="Your team identifier"
            value={teamId}
            onChangeText={setTeamId}
          />

          {/* ── Health Integration ─────────────────── */}
          <View style={styles.healthSection}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Health Integration</Text>

            {Platform.OS === 'ios' ? (
              <View style={styles.healthRow}>
                <View style={styles.healthInfo}>
                  <Ionicons name="heart-outline" size={20} color={colors.accent2} />
                  <View style={styles.healthTextCol}>
                    <Text style={styles.healthTitle}>Apple Health</Text>
                    <Text style={styles.healthSubtitle}>
                      {!hkModuleAvailable
                        ? 'Requires custom dev build'
                        : hkConnected
                          ? 'Connected — syncing sleep'
                          : 'Sync sleep data automatically'}
                    </Text>
                  </View>
                </View>
                {hkLoading ? (
                  <ActivityIndicator size="small" color={colors.accent2} />
                ) : (
                  <Switch
                    value={hkConnected}
                    onValueChange={async (value) => {
                      if (value) {
                        if (!hkModuleAvailable) {
                          Alert.alert(
                            'Not Available',
                            'HealthKit requires a custom development build. Sleep data can still be entered manually during check-in.',
                          );
                          return;
                        }
                        await hkConnect();
                      } else {
                        Alert.alert(
                          'Disconnect Health',
                          'Stop syncing sleep data from Apple Health?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Disconnect', style: 'destructive', onPress: hkDisconnect },
                          ],
                        );
                      }
                    }}
                    disabled={!hkModuleAvailable || hkLoading}
                    trackColor={{ false: colors.border, true: colors.accent2 }}
                    thumbColor={colors.cardLight}
                  />
                )}
              </View>
            ) : (
              <View style={styles.healthRow}>
                <View style={styles.healthInfo}>
                  <Ionicons name="heart-outline" size={20} color={colors.textInactive} />
                  <View style={styles.healthTextCol}>
                    <Text style={styles.healthTitle}>Health Connect</Text>
                    <Text style={styles.healthSubtitle}>
                      Android health integration coming soon. Use manual sleep entry during check-in.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {hkError && (
              <Text style={styles.healthError}>{hkError}</Text>
            )}
          </View>

          {/* ── Study Section ─────────────────────── */}
          <View style={styles.studySection}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Study</Text>

            {/* Subjects */}
            <Text style={styles.fieldLabel}>Subjects</Text>
            <View style={styles.chipRow}>
              {PRESET_SUBJECTS.map((subj) => {
                const selected = subjects.includes(subj);
                return (
                  <TouchableOpacity
                    key={subj}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? colors.accent1 : colors.surface, borderColor: selected ? colors.accent1 : colors.border },
                    ]}
                    onPress={() => toggleSubject(subj)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.textOnLight }]}>
                      {subj}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* Custom subjects already added */}
              {subjects
                .filter((s) => !PRESET_SUBJECTS.includes(s))
                .map((subj) => (
                  <TouchableOpacity
                    key={subj}
                    style={[styles.chip, { backgroundColor: colors.accent1, borderColor: colors.accent1 }]}
                    onPress={() => toggleSubject(subj)}
                  >
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>{subj}</Text>
                    <Ionicons name="close" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              {/* Add custom button */}
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: 'transparent', borderColor: colors.accent1, borderStyle: 'dashed' }]}
                onPress={() => setShowCustomInput(!showCustomInput)}
              >
                <Ionicons name="add" size={16} color={colors.accent1} />
                <Text style={[styles.chipText, { color: colors.accent1 }]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {showCustomInput && (
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Subject name"
                  placeholderTextColor={colors.textInactive}
                  value={customSubject}
                  onChangeText={setCustomSubject}
                  onSubmitEditing={addCustomSubject}
                  autoFocus
                />
                <TouchableOpacity onPress={addCustomSubject} style={styles.customAddBtn}>
                  <Ionicons name="checkmark" size={20} color={colors.accent1} />
                </TouchableOpacity>
              </View>
            )}

            {/* Exam Schedule */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Exam Schedule</Text>
            {exams.length > 0 && (
              <View style={styles.examList}>
                {exams.map((exam) => (
                  <View key={exam.id} style={[styles.examRow, { backgroundColor: colors.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.examSubject, { color: colors.textOnLight }]}>{exam.subject}</Text>
                      <Text style={[styles.examMeta, { color: colors.textInactive }]}>
                        {exam.examType} — {exam.examDate}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeExam(exam.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={22} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {!showAddExam ? (
              <TouchableOpacity
                style={[styles.addExamBtn, { borderColor: colors.accent1 }]}
                onPress={() => {
                  if (subjects.length === 0) {
                    Alert.alert('No Subjects', 'Please select at least one subject first.');
                    return;
                  }
                  setNewExamSubject(subjects[0]);
                  setShowAddExam(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.accent1} />
                <Text style={[styles.addExamBtnText, { color: colors.accent1 }]}>Add Exam</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.addExamForm, { backgroundColor: colors.surface }]}>
                {/* Subject picker */}
                <Text style={styles.miniLabel}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniChipScroll}>
                  {subjects.map((subj) => (
                    <TouchableOpacity
                      key={subj}
                      style={[
                        styles.miniChip,
                        { backgroundColor: newExamSubject === subj ? colors.accent1 : 'transparent', borderColor: newExamSubject === subj ? colors.accent1 : colors.border },
                      ]}
                      onPress={() => setNewExamSubject(subj)}
                    >
                      <Text style={{ color: newExamSubject === subj ? '#FFF' : colors.textOnLight, fontSize: 13 }}>{subj}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Exam type chips */}
                <Text style={styles.miniLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniChipScroll}>
                  {EXAM_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.miniChip,
                        { backgroundColor: newExamType === type ? colors.accent1 : 'transparent', borderColor: newExamType === type ? colors.accent1 : colors.border },
                      ]}
                      onPress={() => setNewExamType(type)}
                    >
                      <Text style={{ color: newExamType === type ? '#FFF' : colors.textOnLight, fontSize: 13 }}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Date scroller */}
                <Text style={styles.miniLabel}>Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniChipScroll}>
                  {NEXT_60_DAYS.map((d) => (
                    <TouchableOpacity
                      key={d.value}
                      style={[
                        styles.miniChip,
                        { backgroundColor: newExamDate === d.value ? colors.accent1 : 'transparent', borderColor: newExamDate === d.value ? colors.accent1 : colors.border },
                      ]}
                      onPress={() => setNewExamDate(d.value)}
                    >
                      <Text style={{ color: newExamDate === d.value ? '#FFF' : colors.textOnLight, fontSize: 13 }}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.addExamActions}>
                  <TouchableOpacity onPress={() => setShowAddExam(false)} style={styles.cancelBtn}>
                    <Text style={{ color: colors.textInactive, fontSize: 14 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addExam} style={[styles.confirmBtn, { backgroundColor: colors.accent1 }]}>
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* ── Training Schedule Section ──────────── */}
          <View style={styles.trainingSection}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Training Schedule</Text>

            {/* Gym */}
            <View style={styles.trainingBlock}>
              <View style={styles.trainingHeader}>
                <Ionicons name="barbell-outline" size={20} color={colors.accent1} />
                <Text style={[styles.trainingTitle, { color: colors.textOnLight }]}>Gym Sessions</Text>
              </View>
              <View style={styles.stepperRow}>
                <Text style={[styles.stepperLabel, { color: colors.textInactive }]}>Per week</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    onPress={() => { setGymSessions(decrement(gymSessions)); if (gymSessions <= 1) setGymFixedDays([]); }}
                    style={[styles.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="remove" size={18} color={colors.textOnLight} />
                  </TouchableOpacity>
                  <Text style={[styles.stepperValue, { color: colors.textOnLight }]}>{gymSessions}</Text>
                  <TouchableOpacity
                    onPress={() => setGymSessions(increment(gymSessions, 7))}
                    style={[styles.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="add" size={18} color={colors.textOnLight} />
                  </TouchableOpacity>
                </View>
              </View>
              {gymSessions > 0 && (
                <>
                  <Text style={[styles.dayPickerLabel, { color: colors.textInactive }]}>Fixed days (optional)</Text>
                  <View style={styles.dayChipRow}>
                    {DAY_LABELS.map((label, idx) => {
                      const selected = gymFixedDays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.dayChip,
                            { backgroundColor: selected ? colors.accent1 : 'transparent', borderColor: selected ? colors.accent1 : colors.border },
                          ]}
                          onPress={() => toggleDay(gymFixedDays, setGymFixedDays, idx)}
                        >
                          <Text style={{ color: selected ? '#FFF' : colors.textOnLight, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {/* Club */}
            <View style={styles.trainingBlock}>
              <View style={styles.trainingHeader}>
                <Ionicons name="football-outline" size={20} color={colors.accent1} />
                <Text style={[styles.trainingTitle, { color: colors.textOnLight }]}>Club Sessions</Text>
              </View>
              <View style={styles.stepperRow}>
                <Text style={[styles.stepperLabel, { color: colors.textInactive }]}>Per week</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    onPress={() => { setClubSessions(decrement(clubSessions)); if (clubSessions <= 1) setClubFixedDays([]); }}
                    style={[styles.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="remove" size={18} color={colors.textOnLight} />
                  </TouchableOpacity>
                  <Text style={[styles.stepperValue, { color: colors.textOnLight }]}>{clubSessions}</Text>
                  <TouchableOpacity
                    onPress={() => setClubSessions(increment(clubSessions, 7))}
                    style={[styles.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="add" size={18} color={colors.textOnLight} />
                  </TouchableOpacity>
                </View>
              </View>
              {clubSessions > 0 && (
                <>
                  <Text style={[styles.dayPickerLabel, { color: colors.textInactive }]}>Fixed days (optional)</Text>
                  <View style={styles.dayChipRow}>
                    {DAY_LABELS.map((label, idx) => {
                      const selected = clubFixedDays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.dayChip,
                            { backgroundColor: selected ? colors.accent1 : 'transparent', borderColor: selected ? colors.accent1 : colors.border },
                          ]}
                          onPress={() => toggleDay(clubFixedDays, setClubFixedDays, idx)}
                        >
                          <Text style={{ color: selected ? '#FFF' : colors.textOnLight, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          </View>
        </Card>

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={isSaving}
          variant="gradient"
          size="large"
          icon="checkmark"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginBottom: spacing.lg,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessGreenBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.body,
    color: colors.readinessGreen,
    marginLeft: spacing.sm,
  },
  sportLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  padelEnabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  padelEnabledText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.success,
    flex: 1,
  },

  // ── Shared section styles ─────────────────────────
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },

  // ── Health Integration ─────────────────────────
  healthSection: {
    marginTop: spacing.lg,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  healthTextCol: {
    flex: 1,
  },
  healthTitle: {
    ...typography.body,
    color: colors.textOnLight,
    fontFamily: fontFamily.medium,
  },
  healthSubtitle: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginTop: 2,
  },
  healthError: {
    ...typography.metadataSmall,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // ── Study section ─────────────────────────────
  studySection: {
    marginTop: spacing.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textOnLight,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textOnLight,
  },
  customAddBtn: {
    padding: 8,
  },

  // Exam list
  examList: {
    gap: 8,
    marginBottom: spacing.sm,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  examSubject: {
    fontSize: 14,
    fontWeight: '600',
  },
  examMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  addExamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  addExamBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  addExamForm: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  miniLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textInactive,
    marginBottom: 2,
  },
  miniChipScroll: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: 6,
  },
  addExamActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
  },

  // ── Training section ──────────────────────────
  trainingSection: {
    marginTop: spacing.lg,
  },
  trainingBlock: {
    marginBottom: spacing.md,
  },
  trainingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  trainingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  dayPickerLabel: {
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  dayChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
