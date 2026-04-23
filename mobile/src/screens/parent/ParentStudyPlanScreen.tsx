/**
 * Parent Study Plan Screen — Read-Only + Suggest
 *
 * Shows child's study data, upcoming study blocks from calendar,
 * and allows parent to send suggestions or notify to fill info.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { Loader } from '../../components/Loader';
import { SmartIcon } from '../../components/SmartIcon';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import {
  getParentChildren,
  getChildStudyProfile,
  notifyChildStudyInfo,
  getChildCalendar,
  createSuggestion,
} from '../../services/api';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type {
  PlayerSummary,
  StudyProfile,
  CalendarEvent,
} from '../../types';

// Legacy screen — no longer mounted as a tab but kept for reference
type Props = {
  navigation: any;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ParentStudyPlanScreen({ navigation }: Props) {
  const { colors } = useTheme();

  // ── State ──────────────────────────────────────────────────────────

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [studyProfile, setStudyProfile] = useState<StudyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [studyEvents, setStudyEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Suggest form
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestNotes, setSuggestNotes] = useState('');
  const [sendingSuggestion, setSendingSuggestion] = useState(false);

  // ── Fetch children ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildren(res.children);
        if (res.children.length > 0) setSelectedChild(res.children[0]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Fetch study profile + calendar when child changes ──────────────

  useEffect(() => {
    if (!selectedChild) return;
    setProfileLoading(true);
    setStudyProfile(null);
    setStudyEvents([]);

    (async () => {
      try {
        const res = await getChildStudyProfile(selectedChild.id);
        setStudyProfile(res.studyProfile);
      } catch {
        setStudyProfile(null);
      } finally {
        setProfileLoading(false);
      }
    })();

    // Fetch upcoming study events from child's calendar (next 30 days)
    (async () => {
      setEventsLoading(true);
      try {
        const today = new Date();
        const startDate = today.toISOString().slice(0, 10);
        const endDate = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
        const res = await getChildCalendar(selectedChild.id, startDate, endDate);
        setStudyEvents(res.events.filter((e) => e.type === 'study_block' || e.type === 'exam'));
      } catch {
        setStudyEvents([]);
      } finally {
        setEventsLoading(false);
      }
    })();
  }, [selectedChild]);

  // ── Notify handler ─────────────────────────────────────────────────

  const handleNotify = useCallback(async () => {
    if (!selectedChild) return;
    setNotifying(true);
    try {
      await notifyChildStudyInfo(selectedChild.id);
      if (Platform.OS === 'web') {
        window.alert(`${selectedChild.name} will be notified to add their study info.`);
      } else {
        Alert.alert('Sent!', `${selectedChild.name} will be notified to add their study info.`);
      }
    } catch (err: any) {
      if (err?.message?.includes('24 hours')) {
        if (Platform.OS === 'web') {
          window.alert('A notification was already sent in the last 24 hours.');
        } else {
          Alert.alert('Already Sent', 'A notification was already sent in the last 24 hours.');
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert('Could not send notification. Try again.');
        } else {
          Alert.alert('Error', 'Could not send notification. Try again.');
        }
      }
    } finally {
      setNotifying(false);
    }
  }, [selectedChild]);

  // ── Send suggestion ────────────────────────────────────────────────

  const handleSendSuggestion = useCallback(async () => {
    if (!selectedChild || !suggestTitle.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please add a title for your suggestion.');
      } else {
        Alert.alert('Missing Info', 'Please add a title for your suggestion.');
      }
      return;
    }

    setSendingSuggestion(true);
    try {
      await createSuggestion({
        playerId: selectedChild.id,
        suggestionType: 'study_block',
        title: suggestTitle.trim(),
        payload: {
          type: 'study_block',
          notes: suggestNotes.trim() || undefined,
          parentSuggestion: true,
        },
      });
      if (Platform.OS === 'web') {
        window.alert(`Suggestion sent to ${selectedChild.name}.`);
      } else {
        Alert.alert('Sent!', `Suggestion sent to ${selectedChild.name}.`);
      }
      setShowSuggestForm(false);
      setSuggestTitle('');
      setSuggestNotes('');
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Failed to send suggestion. Try again.');
      } else {
        Alert.alert('Error', 'Failed to send suggestion. Try again.');
      }
    } finally {
      setSendingSuggestion(false);
    }
  }, [selectedChild, suggestTitle, suggestNotes]);

  // ── Determine missing data ─────────────────────────────────────────

  const missingSubjects = (studyProfile?.studySubjects?.length ?? 0) === 0;
  const missingExams = (studyProfile?.examSchedule?.length ?? 0) === 0;
  const hasMissingData = studyProfile && (missingSubjects || missingExams);

  const missingDataMessage = useMemo(() => {
    if (missingSubjects && missingExams) return 'No study info yet';
    if (missingSubjects) return 'No subjects added yet';
    if (missingExams) return 'No exams scheduled yet';
    return '';
  }, [missingSubjects, missingExams]);

  // ── Loading state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <PlayerScreen label="STUDY" title="Plan" onBack={() => navigation.goBack()} scroll={false}>
        <Loader size="lg" style={{ marginTop: 60 }} />
      </PlayerScreen>
    );
  }

  if (children.length === 0) {
    return (
      <PlayerScreen label="STUDY" title="Plan" onBack={() => navigation.goBack()} scroll={false}>
        <View style={styles.emptyCenter}>
          <SmartIcon name="lock-closed-outline" size={40} color={colors.textInactive} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No children linked</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Link your child first to view their study plans.
          </Text>
        </View>
      </PlayerScreen>
    );
  }

  // ── Main render ────────────────────────────────────────────────────

  return (
    <PlayerScreen label="STUDY" title="Plan" onBack={() => navigation.goBack()} contentStyle={styles.scroll}>
        {/* Child selector (if multiple) */}
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childSelector}>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childChip,
                  {
                    backgroundColor: selectedChild?.id === child.id ? colors.accent1 : colors.surface,
                    borderColor: selectedChild?.id === child.id ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => setSelectedChild(child)}
              >
                <Text style={{ color: selectedChild?.id === child.id ? colors.textOnDark : colors.textOnDark, fontSize: 14, fontFamily: fontFamily.semiBold }}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {profileLoading && (
          <Loader size="lg" style={{ marginTop: 40 }} />
        )}

        {/* Missing data state */}
        {!profileLoading && hasMissingData && selectedChild && (
          <View style={styles.emptyCenter}>
            <SmartIcon name="school-outline" size={48} color={colors.textInactive} />
            <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>{missingDataMessage}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {selectedChild.name} needs to add this info in their profile.
            </Text>
            <TouchableOpacity
              style={[styles.notifyBtn, { backgroundColor: colors.accent1, opacity: notifying ? 0.6 : 1 }]}
              onPress={handleNotify}
              disabled={notifying}
            >
              {notifying ? (
                <Loader size="sm" />
              ) : (
                <>
                  <SmartIcon name="notifications-outline" size={18} color={colors.textOnDark} />
                  <Text style={[styles.notifyBtnText, { color: colors.textOnDark }]}>Notify {selectedChild.name.split(' ')[0]}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Read-only view when data exists */}
        {!profileLoading && studyProfile && !hasMissingData && (
          <>
            {/* Child Data Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.summaryTitle, { color: colors.textOnDark }]}>
                {studyProfile.name?.split(' ')[0]}'s Study Info
              </Text>

              {/* Subjects */}
              <View style={styles.summaryRow}>
                <SmartIcon name="book-outline" size={16} color={colors.accent1} />
                <View style={styles.summaryChips}>
                  {studyProfile.studySubjects.map((s) => (
                    <View key={s} style={[styles.readOnlyChip, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.readOnlyChipText, { color: colors.textOnDark }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Exams */}
              <View style={styles.summaryRow}>
                <SmartIcon name="document-text-outline" size={16} color={colors.error} />
                <View style={{ flex: 1, gap: 4 }}>
                  {studyProfile.examSchedule.map((e) => (
                    <Text key={e.id} style={[styles.examLine, { color: colors.textSecondary }]}>
                      {e.subject} ({e.examType}) — {e.examDate}
                    </Text>
                  ))}
                </View>
              </View>

              {/* Training */}
              {studyProfile.trainingPreferences && (
                <View style={styles.summaryRow}>
                  <SmartIcon name="barbell-outline" size={16} color={colors.accent1} />
                  <Text style={[styles.examLine, { color: colors.textSecondary }]}>
                    Gym: {studyProfile.trainingPreferences.gymSessionsPerWeek || 0}x/wk
                    {(studyProfile.trainingPreferences.gymFixedDays?.length ?? 0) > 0 &&
                      ` (${studyProfile.trainingPreferences.gymFixedDays.map((d: number) => DAY_LABELS[d]).join(', ')})`}
                    {' | '}
                    Club: {studyProfile.trainingPreferences.clubSessionsPerWeek || 0}x/wk
                    {(studyProfile.trainingPreferences.clubFixedDays?.length ?? 0) > 0 &&
                      ` (${studyProfile.trainingPreferences.clubFixedDays.map((d: number) => DAY_LABELS[d]).join(', ')})`}
                  </Text>
                </View>
              )}

              {/* Generator config summary */}
              {studyProfile.studyPlanConfig && Object.keys(studyProfile.studyPlanConfig).length > 0 && (
                <View style={styles.summaryRow}>
                  <SmartIcon name="settings-outline" size={16} color={colors.textInactive} />
                  <Text style={[styles.examLine, { color: colors.textInactive }]}>
                    {(studyProfile.studyPlanConfig as any).sessionDuration || 45}min sessions
                    {' · '}
                    {(studyProfile.studyPlanConfig as any).timeSlotStart || '15:00'} – {(studyProfile.studyPlanConfig as any).timeSlotEnd || '18:00'}
                  </Text>
                </View>
              )}
            </View>

            {/* Upcoming Study Blocks from Calendar */}
            <View style={[styles.eventsSection, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>
                Upcoming Study Blocks
              </Text>
              {eventsLoading && <Loader size="sm" />}
              {!eventsLoading && studyEvents.length === 0 && (
                <Text style={[styles.emptyEventsText, { color: colors.textInactive }]}>
                  No study blocks scheduled yet.
                </Text>
              )}
              {!eventsLoading && studyEvents.map((event) => (
                <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.surface }]}>
                  <View style={[styles.eventDot, { backgroundColor: event.type === 'exam' ? colors.eventExam : colors.eventStudyBlock }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventName, { color: colors.textOnDark }]}>{event.name}</Text>
                    <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                      {event.date} · {event.startTime || ''} – {event.endTime || ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16 }}>{event.type === 'exam' ? '' : ''}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent1 }]}
                onPress={() => setShowSuggestForm(true)}
              >
                <SmartIcon name="bulb-outline" size={18} color={colors.textOnDark} />
                <Text style={[styles.actionBtnText, { color: colors.textOnDark }]}>Suggest Changes</Text>
              </TouchableOpacity>
            </View>

            {/* Suggest form */}
            {showSuggestForm && (
              <View style={[styles.suggestForm, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Send a Suggestion</Text>
                <TextInput
                  style={[styles.input, { color: colors.textOnDark, borderColor: colors.border }]}
                  placeholder="Suggestion title (e.g. Add extra Math session)"
                  placeholderTextColor={colors.textInactive}
                  value={suggestTitle}
                  onChangeText={setSuggestTitle}
                />
                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.textOnDark, borderColor: colors.border }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={colors.textInactive}
                  value={suggestNotes}
                  onChangeText={setSuggestNotes}
                  multiline
                  numberOfLines={3}
                />
                <View style={styles.suggestActions}>
                  <TouchableOpacity onPress={() => setShowSuggestForm(false)} style={styles.cancelBtn}>
                    <Text style={{ color: colors.textInactive, fontSize: 14 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: colors.accent1, opacity: sendingSuggestion ? 0.6 : 1 }]}
                    onPress={handleSendSuggestion}
                    disabled={sendingSuggestion}
                  >
                    {sendingSuggestion ? (
                      <Loader size="sm" />
                    ) : (
                      <>
                        <SmartIcon name="paper-plane" size={16} color={colors.textOnDark} />
                        <Text style={{ color: colors.textOnDark, fontSize: 14, fontFamily: fontFamily.semiBold }}>Send</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
    </PlayerScreen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    marginBottom: spacing.md,
  },

  // Child selector
  childSelector: {
    marginBottom: spacing.md,
  },
  childChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },

  // Empty / missing data states
  emptyCenter: {
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  notifyBtnText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },

  // Summary card
  summaryCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  summaryTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  summaryChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  readOnlyChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  readOnlyChipText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  examLine: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Events section
  eventsSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    marginBottom: 4,
  },
  emptyEventsText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventName: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  eventTime: {
    fontSize: 12,
    marginTop: 2,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
  },

  // Suggest form
  suggestForm: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
  },
});
