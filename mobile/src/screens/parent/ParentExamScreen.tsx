/**
 * Parent Exam Screen — Exam Schedule tab
 *
 * Shows child's upcoming exams + subjects.
 * FAB navigates to ParentAddExam.
 * Child selector chips if multiple children.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import { Loader } from '../../components/Loader';
import * as Haptics from 'expo-haptics';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { getParentChildren, getChildStudyProfile } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily, screenBg } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary, StudyProfile, ExamEntry } from '../../types';

// @ts-ignore — Legacy tab name, now embedded in ParentChildDetailScreen
type TabProps = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'Children'>,
  NativeStackScreenProps<ParentStackParamList>
>;

// Props can come from tab navigation OR embedded in ParentChildDetailScreen
interface EmbeddedProps {
  childId?: string;
  childName?: string;
  navigation?: any;
}

type Props = TabProps | EmbeddedProps;

// ── Helpers ──────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function examTypeEmoji(type: string): string {
  switch (type?.toLowerCase()) {
    case 'final': return '';
    case 'midterm': case 'mid-term': return '';
    case 'quiz': return '';
    default: return '';
  }
}

// ── Component ────────────────────────────────────────────────────────────

export function ParentExamScreen(props: Props) {
  const { colors } = useTheme();
  const navigation = (props as any).navigation;

  // If childId is provided directly (embedded mode), skip child fetching
  const embeddedChildId = (props as EmbeddedProps).childId;
  const embeddedChildName = (props as EmbeddedProps).childName;
  const isEmbedded = !!embeddedChildId;

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(
    embeddedChildId ? { id: embeddedChildId, name: embeddedChildName || '' } as PlayerSummary : null
  );
  const [loading, setLoading] = useState(!isEmbedded);
  const [studyProfile, setStudyProfile] = useState<StudyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Fetch children (only if not embedded) ─────────────────────────

  useEffect(() => {
    if (isEmbedded) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await getParentChildren();
        if (!isMounted) return;
        setChildren(res.children);
        if (res.children.length > 0) setSelectedChild(res.children[0]);
      } catch (e) {
        console.warn('[ParentExamScreen] fetch children error:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [isEmbedded]);

  // ── Fetch study profile when child changes ──────────────────────────

  useEffect(() => {
    if (!selectedChild) return;
    let isMounted = true;
    setProfileLoading(true);
    setStudyProfile(null);

    (async () => {
      try {
        const res = await getChildStudyProfile(selectedChild.id);
        if (!isMounted) return;
        setStudyProfile(res.studyProfile);
      } catch (e) {
        console.warn('[ParentExamScreen] fetch study profile error:', e);
        if (isMounted) setStudyProfile(null);
      } finally {
        if (isMounted) setProfileLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [selectedChild]);

  // ── Computed ────────────────────────────────────────────────────────

  const exams = useMemo(() => {
    if (!studyProfile?.examSchedule) return [];
    return [...studyProfile.examSchedule].sort(
      (a, b) => a.examDate.localeCompare(b.examDate),
    );
  }, [studyProfile]);

  const upcomingExams = useMemo(
    () => exams.filter((e) => daysUntil(e.examDate) >= 0),
    [exams],
  );

  const pastExams = useMemo(
    () => exams.filter((e) => daysUntil(e.examDate) < 0),
    [exams],
  );

  const subjects = studyProfile?.studySubjects ?? [];

  // ── Loading / empty states ──────────────────────────────────────────

  if (loading) {
    const body = <Loader size="lg" style={{ marginTop: 60 }} />;
    return isEmbedded ? (
      <View style={[styles.container, { backgroundColor: screenBg }]}>{body}</View>
    ) : (
      <PlayerScreen label="EXAMS" title="Exam schedule" onBack={() => navigation?.goBack?.()} scroll={false}>
        {body}
      </PlayerScreen>
    );
  }

  if (!isEmbedded && children.length === 0) {
    return (
      <PlayerScreen label="EXAMS" title="Exam schedule" onBack={() => navigation?.goBack?.()} scroll={false}>
        <View style={styles.emptyContainer}>
          <SmartIcon name="lock-closed-outline" size={40} color={colors.textInactive} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
            Waiting for confirmation
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your child hasn't confirmed the link yet.
          </Text>
        </View>
      </PlayerScreen>
    );
  }

  const firstName = selectedChild?.name?.split(' ')[0] || 'Child';

  // ── Render ──────────────────────────────────────────────────────────

  const body = (
    <>
      {/* Child selector — only show when standalone with multiple children */}
      {!isEmbedded && children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.childSelector}
          contentContainerStyle={styles.childSelectorContent}
        >
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
              <Text
                style={[
                  styles.childChipText,
                  { color: selectedChild?.id === child.id ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {profileLoading ? (
        <Loader size="lg" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Subjects pills */}
          {subjects.length > 0 && (
            <View style={styles.subjectsRow}>
              {subjects.map((s) => (
                <View key={s} style={[styles.subjectPill, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.subjectText, { color: colors.textOnDark }]}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Upcoming Exams */}
          <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>
            Upcoming
          </Text>
          {upcomingExams.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surfaceElevated }]}>
              <SmartIcon name="school-outline" size={32} color={colors.textInactive} />
              <Text style={[styles.emptyCardText, { color: colors.textInactive }]}>
                No exams scheduled yet
              </Text>
              <Text style={[styles.emptyCardSubtext, { color: colors.textMuted }]}>
                Tap + to add an exam for {firstName}
              </Text>
            </View>
          ) : (
            upcomingExams.map((exam) => {
              const days = daysUntil(exam.examDate);
              const isUrgent = days <= 3;
              return (
                <View
                  key={exam.id}
                  style={[
                    styles.examCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderLeftColor: isUrgent ? colors.error : colors.accent1,
                    },
                  ]}
                >
                  <View style={styles.examCardHeader}>
                    <Text style={styles.examEmoji}>{examTypeEmoji(exam.examType)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.examSubject, { color: colors.textOnDark }]}>
                        {exam.subject}
                      </Text>
                      <Text style={[styles.examType, { color: colors.textMuted }]}>
                        {exam.examType}
                      </Text>
                    </View>
                    <View style={styles.examDateBadge}>
                      <Text style={[styles.examDateText, { color: isUrgent ? colors.error : colors.textOnDark }]}>
                        {new Date(exam.examDate + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <Text style={[styles.examDaysText, { color: isUrgent ? colors.error : colors.textMuted }]}>
                        {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                      </Text>
                    </View>
                  </View>
                  {exam.notes && (
                    <Text style={[styles.examNotes, { color: colors.textSecondary }]}>
                      {exam.notes}
                    </Text>
                  )}
                </View>
              );
            })
          )}

          {/* Past Exams */}
          {pastExams.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textInactive, marginTop: spacing.lg }]}>
                Past
              </Text>
              {pastExams.slice(0, 5).map((exam) => (
                <View
                  key={exam.id}
                  style={[styles.examCard, { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.border, opacity: 0.6 }]}
                >
                  <View style={styles.examCardHeader}>
                    <Text style={styles.examEmoji}>{examTypeEmoji(exam.examType)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.examSubject, { color: colors.textOnDark }]}>{exam.subject}</Text>
                      <Text style={[styles.examType, { color: colors.textMuted }]}>{exam.examType}</Text>
                    </View>
                    <Text style={[styles.examDateText, { color: colors.textMuted }]}>
                      {new Date(exam.examDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Bottom padding for FAB */}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* FAB — Add Exam */}
      {selectedChild && (
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate('ParentAddExam', {
              childId: selectedChild.id,
              childName: selectedChild.name,
            });
          }}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.accent1, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <SmartIcon name="add" size={28} color={colors.textOnDark} />
        </Pressable>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <View style={[styles.container, { backgroundColor: screenBg }]}>{body}</View>
    );
  }

  return (
    <PlayerScreen label="EXAMS" title="Exam schedule" onBack={() => navigation?.goBack?.()} scroll={false}>
      {body}
    </PlayerScreen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerArea: {
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
  },
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  childSelector: {
    maxHeight: 44,
    marginBottom: spacing.xs,
  },
  childSelectorContent: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  childChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  childChipText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  scrollContent: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: layout.navHeight + spacing.xl,
  },
  subjectsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  subjectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  subjectText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyCardText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  emptyCardSubtext: {
    fontSize: 13,
  },
  examCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
  },
  examCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  examEmoji: {
    fontSize: 20,
  },
  examSubject: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  examType: {
    fontSize: 12,
    marginTop: 1,
  },
  examDateBadge: {
    alignItems: 'flex-end',
  },
  examDateText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
  examDaysText: {
    fontSize: 11,
    marginTop: 1,
  },
  examNotes: {
    fontSize: 12,
    marginTop: spacing.xs,
    marginLeft: 32,
    lineHeight: 17,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
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
  },
  fab: {
    position: 'absolute',
    bottom: layout.navHeight + spacing.md,
    right: layout.screenMargin,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
});
