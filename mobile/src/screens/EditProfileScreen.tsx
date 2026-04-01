/**
 * Edit Profile Screen (Settings)
 * Study schedule, subjects, exams, and custom training types.
 * On save, auto-populates calendar with school + training blocks for the next month.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { Button, Card, ErrorState } from '../components';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import { updateUser, createCalendarEvent } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type {
  ExamEntry,
  ExamType,
  EducationType,
  SchoolSchedule,
  CustomTrainingType,
  CalendarEventInput,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────

const PRESET_SUBJECTS = [
  'Math', 'Physics', 'English', 'Biology', 'History', 'Chemistry', 'Computer Science',
];

const EXAM_TYPES: ExamType[] = ['Quiz', 'Mid-term', 'Final', 'Essay', 'Presentation'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 20; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

const TRAINING_ICONS: { name: string; icon: string }[] = [
  { name: 'Barbell', icon: 'barbell-outline' },
  { name: 'Football', icon: 'football-outline' },
  { name: 'Basketball', icon: 'basketball-outline' },
  { name: 'Tennis', icon: 'tennisball-outline' },
  { name: 'Body', icon: 'body-outline' },
  { name: 'Bicycle', icon: 'bicycle-outline' },
  { name: 'Walk', icon: 'walk-outline' },
  { name: 'Fitness', icon: 'fitness-outline' },
];

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

// ── Helpers ────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Generate calendar events for the next 30 days from school schedule + training types.
 * Returns an array of CalendarEventInput ready to POST.
 */
function generateScheduleEvents(
  schoolSchedule: SchoolSchedule,
  trainingTypes: CustomTrainingType[],
  exams: ExamEntry[],
): CalendarEventInput[] {
  const events: CalendarEventInput[] = [];
  const now = new Date();

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dayOfWeek = d.getDay(); // 0=Sun ... 6=Sat
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // School block
    if (schoolSchedule.days.includes(dayOfWeek)) {
      events.push({
        name: schoolSchedule.type === 'university' ? 'University' : 'School',
        type: 'study_block',
        sport: 'general',
        date: dateStr,
        startTime: schoolSchedule.startTime,
        endTime: schoolSchedule.endTime,
      });
    }

    // Training blocks
    for (const tt of trainingTypes) {
      if (tt.fixedDays.includes(dayOfWeek)) {
        events.push({
          name: tt.name,
          type: 'training',
          sport: 'general',
          date: dateStr,
          startTime: undefined, // user sets time later
          endTime: undefined,
        });
      }
    }
  }

  // Exam events
  for (const exam of exams) {
    const examDate = exam.examDate;
    // Only add if in the next 60 days
    const examD = new Date(examDate + 'T00:00:00');
    const diffDays = Math.ceil((examD.getTime() - now.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays <= 60) {
      events.push({
        name: `${exam.examType}: ${exam.subject}`,
        type: 'exam',
        sport: 'general',
        date: examDate,
      });
    }
  }

  return events;
}

// ── Component ────────────────────────────────────────────────────────

export function EditProfileScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { profile, refreshProfile } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // School schedule
  const initSched = profile?.schoolSchedule;
  const [eduType, setEduType] = useState<EducationType>(initSched?.type || 'school');
  const [schoolDays, setSchoolDays] = useState<number[]>(initSched?.days || [1, 2, 3, 4, 5]);
  const [schoolStart, setSchoolStart] = useState(initSched?.startTime || '08:00');
  const [schoolEnd, setSchoolEnd] = useState(initSched?.endTime || '15:00');

  // Study fields
  const [subjects, setSubjects] = useState<string[]>(profile?.studySubjects || []);
  const [customSubject, setCustomSubject] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [exams, setExams] = useState<ExamEntry[]>(profile?.examSchedule || []);
  const [showAddExam, setShowAddExam] = useState(false);
  const [newExamSubject, setNewExamSubject] = useState('');
  const [newExamType, setNewExamType] = useState<ExamType>('Final');
  const [newExamDate, setNewExamDate] = useState('');

  // Custom training types
  const [trainingTypes, setTrainingTypes] = useState<CustomTrainingType[]>(
    profile?.customTrainingTypes || [],
  );
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [newTrainingName, setNewTrainingName] = useState('');
  const [newTrainingIcon, setNewTrainingIcon] = useState('barbell-outline');
  const [newTrainingSessions, setNewTrainingSessions] = useState(3);
  const [newTrainingDays, setNewTrainingDays] = useState<number[]>([]);

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
  }, [newExamSubject, newExamType, newExamDate, exams]);

  const removeExam = useCallback((id: string) => {
    setExams((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Day toggle helper ─────────────────────────────────────────────

  const toggleDay = useCallback(
    (arr: number[], setArr: React.Dispatch<React.SetStateAction<number[]>>, day: number) => {
      setArr(arr.includes(day) ? arr.filter((d) => d !== day) : [...arr, day]);
    },
    [],
  );

  // ── Training type helpers ─────────────────────────────────────────

  const addTrainingType = useCallback(() => {
    const trimmedName = newTrainingName.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter a name for this training type.');
      return;
    }
    const newType: CustomTrainingType = {
      id: Date.now().toString(),
      name: trimmedName,
      icon: newTrainingIcon,
      sessionsPerWeek: newTrainingSessions,
      fixedDays: newTrainingDays,
    };
    setTrainingTypes((prev) => [...prev, newType]);
    setNewTrainingName('');
    setNewTrainingIcon('barbell-outline');
    setNewTrainingSessions(3);
    setNewTrainingDays([]);
    setShowAddTraining(false);
  }, [newTrainingName, newTrainingIcon, newTrainingSessions, newTrainingDays]);

  const removeTrainingType = useCallback((id: string) => {
    setTrainingTypes((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Stepper helpers ─────────────────────────────────────────────────

  const increment = (val: number, max: number) => Math.min(val + 1, max);
  const decrement = (val: number) => Math.max(val - 1, 0);

  // ── Save + auto-populate calendar ────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const schoolSchedule: SchoolSchedule = {
        type: eduType,
        days: schoolDays,
        startTime: schoolStart,
        endTime: schoolEnd,
      };

      // 1. Save profile
      await updateUser({
        studySubjects: subjects,
        examSchedule: exams,
        schoolSchedule,
        customTrainingTypes: trainingTypes,
      } as Parameters<typeof updateUser>[0]);

      // 2. Auto-populate calendar events for next 30 days
      const scheduleEvents = generateScheduleEvents(schoolSchedule, trainingTypes, exams);

      // Fire-and-forget: create all events in parallel (don't block UI)
      const createPromises = scheduleEvents.map((evt) =>
        createCalendarEvent(evt).catch(() => null), // silently skip failures (e.g. locked days)
      );

      // Batch in groups of 5 to avoid hammering the API
      for (let i = 0; i < createPromises.length; i += 5) {
        await Promise.all(createPromises.slice(i, i + 5));
      }

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
            <SmartIcon name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.successText}>Saved! Calendar updated for the next month.</Text>
          </View>
        )}

        <Card style={styles.card}>
          {/* ── Study Section ─────────────────────── */}
          <View>
            <Text style={styles.sectionLabel}>Study</Text>

            {/* Education type toggle */}
            <Text style={styles.fieldLabel}>Education Type</Text>
            <View style={styles.eduToggleRow}>
              <TouchableOpacity
                style={[
                  styles.eduToggle,
                  {
                    backgroundColor: eduType === 'school' ? colors.accent1 : 'transparent',
                    borderColor: eduType === 'school' ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => setEduType('school')}
              >
                <SmartIcon
                  name="school-outline"
                  size={16}
                  color={eduType === 'school' ? '#FFF' : colors.textOnLight}
                />
                <Text style={{ color: eduType === 'school' ? '#FFF' : colors.textOnLight, fontSize: 13, fontWeight: '600' }}>
                  School
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.eduToggle,
                  {
                    backgroundColor: eduType === 'university' ? colors.accent1 : 'transparent',
                    borderColor: eduType === 'university' ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => setEduType('university')}
              >
                <SmartIcon
                  name="library-outline"
                  size={16}
                  color={eduType === 'university' ? '#FFF' : colors.textOnLight}
                />
                <Text style={{ color: eduType === 'university' ? '#FFF' : colors.textOnLight, fontSize: 13, fontWeight: '600' }}>
                  University
                </Text>
              </TouchableOpacity>
            </View>

            {/* School days */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              {eduType === 'school' ? 'School' : 'University'} Days
            </Text>
            <View style={styles.dayChipRow}>
              {DAY_LABELS.map((label, idx) => {
                const selected = schoolDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: selected ? colors.accent1 : 'transparent',
                        borderColor: selected ? colors.accent1 : colors.border,
                      },
                    ]}
                    onPress={() => toggleDay(schoolDays, setSchoolDays, idx)}
                  >
                    <Text style={{ color: selected ? '#FFF' : colors.textOnLight, fontSize: 12, fontWeight: '600' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Daily hours: From - To */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Daily Hours</Text>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>From</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniChipScroll}>
                  {TIME_OPTIONS.map((t) => (
                    <TouchableOpacity
                      key={`start-${t}`}
                      style={[
                        styles.miniChip,
                        {
                          backgroundColor: schoolStart === t ? colors.accent1 : 'transparent',
                          borderColor: schoolStart === t ? colors.accent1 : colors.border,
                        },
                      ]}
                      onPress={() => setSchoolStart(t)}
                    >
                      <Text style={{ color: schoolStart === t ? '#FFF' : colors.textOnLight, fontSize: 13 }}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniChipScroll}>
                  {TIME_OPTIONS.map((t) => (
                    <TouchableOpacity
                      key={`end-${t}`}
                      style={[
                        styles.miniChip,
                        {
                          backgroundColor: schoolEnd === t ? colors.accent1 : 'transparent',
                          borderColor: schoolEnd === t ? colors.accent1 : colors.border,
                        },
                      ]}
                      onPress={() => setSchoolEnd(t)}
                    >
                      <Text style={{ color: schoolEnd === t ? '#FFF' : colors.textOnLight, fontSize: 13 }}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Subjects */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Subjects</Text>
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
              {subjects
                .filter((s) => !PRESET_SUBJECTS.includes(s))
                .map((subj) => (
                  <TouchableOpacity
                    key={subj}
                    style={[styles.chip, { backgroundColor: colors.accent1, borderColor: colors.accent1 }]}
                    onPress={() => toggleSubject(subj)}
                  >
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>{subj}</Text>
                    <SmartIcon name="close" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: 'transparent', borderColor: colors.accent1, borderStyle: 'dashed' }]}
                onPress={() => setShowCustomInput(!showCustomInput)}
              >
                <SmartIcon name="add" size={16} color={colors.accent1} />
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
                  <SmartIcon name="checkmark" size={20} color={colors.accent1} />
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
                      <SmartIcon name="close-circle" size={22} color={colors.error} />
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
                <SmartIcon name="add-circle-outline" size={18} color={colors.accent1} />
                <Text style={[styles.addExamBtnText, { color: colors.accent1 }]}>Add Exam</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.addExamForm, { backgroundColor: colors.surface }]}>
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
                    <SmartIcon name="checkmark" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* ── My Training Section ──────────────── */}
          <View style={styles.trainingSection}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>My Training</Text>

            {trainingTypes.map((tt) => (
              <View key={tt.id} style={[styles.trainingCard, { backgroundColor: colors.surface }]}>
                <View style={styles.trainingCardHeader}>
                  <View style={styles.trainingCardTitle}>
                    <SmartIcon name={tt.icon as any} size={20} color={colors.accent1} />
                    <Text style={[styles.trainingCardName, { color: colors.textOnLight }]}>{tt.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeTrainingType(tt.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <SmartIcon name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
                <View style={styles.trainingCardMeta}>
                  <Text style={[styles.trainingCardMetaText, { color: colors.textInactive }]}>
                    {tt.sessionsPerWeek}x/week
                  </Text>
                  {tt.fixedDays.length > 0 && (
                    <Text style={[styles.trainingCardMetaText, { color: colors.textInactive }]}>
                      {' · '}
                      {tt.fixedDays.map((d) => DAY_LABELS[d]).join(', ')}
                    </Text>
                  )}
                </View>
              </View>
            ))}

            {!showAddTraining ? (
              <TouchableOpacity
                style={[styles.addTrainingBtn, { borderColor: colors.accent1 }]}
                onPress={() => setShowAddTraining(true)}
              >
                <SmartIcon name="add-circle-outline" size={18} color={colors.accent1} />
                <Text style={[styles.addExamBtnText, { color: colors.accent1 }]}>Add Training</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.addTrainingForm, { backgroundColor: colors.surface }]}>
                <Text style={styles.miniLabel}>Name</Text>
                <TextInput
                  style={[styles.trainingNameInput, { borderColor: colors.border, color: colors.textOnLight }]}
                  placeholder="e.g. Gym, Club, Private Coach"
                  placeholderTextColor={colors.textInactive}
                  value={newTrainingName}
                  onChangeText={setNewTrainingName}
                />

                <Text style={[styles.miniLabel, { marginTop: spacing.sm }]}>Icon</Text>
                <View style={styles.iconChipRow}>
                  {TRAINING_ICONS.map((item) => {
                    const selected = newTrainingIcon === item.icon;
                    return (
                      <TouchableOpacity
                        key={item.icon}
                        style={[
                          styles.iconChip,
                          {
                            backgroundColor: selected ? colors.accent1 : 'transparent',
                            borderColor: selected ? colors.accent1 : colors.border,
                          },
                        ]}
                        onPress={() => setNewTrainingIcon(item.icon)}
                      >
                        <SmartIcon
                          name={item.icon as any}
                          size={18}
                          color={selected ? '#FFF' : colors.textOnLight}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={[styles.stepperRow, { marginTop: spacing.sm }]}>
                  <Text style={[styles.stepperLabel, { color: colors.textInactive }]}>Sessions / week</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      onPress={() => setNewTrainingSessions(decrement(newTrainingSessions))}
                      style={[styles.stepperBtn, { borderColor: colors.border }]}
                    >
                      <SmartIcon name="remove" size={18} color={colors.textOnLight} />
                    </TouchableOpacity>
                    <Text style={[styles.stepperValue, { color: colors.textOnLight }]}>{newTrainingSessions}</Text>
                    <TouchableOpacity
                      onPress={() => setNewTrainingSessions(increment(newTrainingSessions, 7))}
                      style={[styles.stepperBtn, { borderColor: colors.border }]}
                    >
                      <SmartIcon name="add" size={18} color={colors.textOnLight} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.dayPickerLabel, { color: colors.textInactive }]}>Fixed days (optional)</Text>
                <View style={styles.dayChipRow}>
                  {DAY_LABELS.map((label, idx) => {
                    const selected = newTrainingDays.includes(idx);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.dayChip,
                          {
                            backgroundColor: selected ? colors.accent1 : 'transparent',
                            borderColor: selected ? colors.accent1 : colors.border,
                          },
                        ]}
                        onPress={() => toggleDay(newTrainingDays, setNewTrainingDays, idx)}
                      >
                        <Text style={{ color: selected ? '#FFF' : colors.textOnLight, fontSize: 12, fontWeight: '600' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.addExamActions}>
                  <TouchableOpacity onPress={() => setShowAddTraining(false)} style={styles.cancelBtn}>
                    <Text style={{ color: colors.textInactive, fontSize: 14 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addTrainingType} style={[styles.confirmBtn, { backgroundColor: colors.accent1 }]}>
                    <SmartIcon name="checkmark" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Card>

        <Button
          title={isSaving ? 'Saving & Populating Calendar...' : 'Save & Populate Calendar'}
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

  eduToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.xs,
  },
  eduToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },

  timeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
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

  trainingSection: {
    marginTop: spacing.lg,
  },
  trainingCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  trainingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trainingCardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trainingCardName: {
    fontSize: 15,
    fontWeight: '600',
  },
  trainingCardMeta: {
    flexDirection: 'row',
    marginTop: 4,
    marginLeft: 28,
  },
  trainingCardMetaText: {
    fontSize: 12,
  },
  addTrainingBtn: {
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
  addTrainingForm: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  trainingNameInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  iconChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
