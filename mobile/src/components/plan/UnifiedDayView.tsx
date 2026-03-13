/**
 * UnifiedDayView — Shared day-view component for player, coach, and parent.
 *
 * Player: full interactive view (readiness, balance, check-in, lock-in, timeline, FAB)
 * Coach/Parent: read-only view (timeline only, recommend FAB)
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  BalanceBar,
  LockInCard,
  ExamStudyPlanner,
} from '../../components';
import type { UpcomingExam } from '../../components';
import { ReadinessRing } from '../../components/flow/ReadinessRing';
import { FlowTimeline } from '../../components/flow/FlowTimeline';
import { ScrollFadeOverlay } from '../../components/ScrollFadeOverlay';
import { SuggestionsBanner } from '../../components/SuggestionsBanner';
import { spacing, layout, shadows, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import type { CalendarEvent, ReadinessLevel, Suggestion } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedDayViewProps {
  // Role context
  role: 'player' | 'coach' | 'parent';
  isOwner: boolean;
  targetUserName?: string;

  // Calendar data
  events: CalendarEvent[];
  selectedDay: Date;
  dayLabel: string;
  isToday: boolean;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;

  // Day navigation
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;

  // Player-only props (undefined for coach/parent)
  readiness?: { score: number; level: ReadinessLevel };
  trainingHours?: number;
  academicHours?: number;
  aiInsightText?: string;
  hasCheckedInToday?: boolean;
  suggestions?: Suggestion[];
  onSuggestionResolved?: (id: string) => void;
  upcomingExams?: UpcomingExam[];
  completedEvents?: Set<string>;
  onComplete?: (id: string) => void;
  onSkip?: (id: string) => void;
  onUndo?: (id: string) => void;
  onCheckinPress?: () => void;

  // FAB
  onFabPress: () => void;
  fabIcon?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedDayView({
  role,
  isOwner,
  targetUserName,
  events,
  selectedDay,
  dayLabel,
  isToday,
  isLoading,
  refreshing,
  onRefresh,
  onPrevDay,
  onNextDay,
  onToday,
  readiness,
  trainingHours,
  academicHours,
  aiInsightText,
  hasCheckedInToday,
  suggestions,
  onSuggestionResolved,
  upcomingExams,
  completedEvents,
  onComplete,
  onSkip,
  onUndo,
  onCheckinPress,
  onFabPress,
  fabIcon = 'add',
}: UnifiedDayViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const emptyCompleted = useMemo(() => new Set<string>(), []);
  const noop = () => {};

  // Flow header label
  const flowLabel = useMemo(() => {
    if (isOwner) {
      return isToday ? "TODAY'S FLOW" : `${dayLabel.toUpperCase()}'S FLOW`;
    }
    const firstName = targetUserName?.split(' ')[0] || 'Player';
    return `${firstName.toUpperCase()}'S FLOW`;
  }, [isOwner, isToday, dayLabel, targetUserName]);

  return (
    <View style={{ flex: 1 }}>
      {/* ─── Day Navigation Bar ─── */}
      <View style={styles.dayNav}>
        <Pressable onPress={onPrevDay} hitSlop={12} style={styles.dayNavArrow}>
          <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
        </Pressable>
        <Pressable onPress={onToday} style={styles.dayNavCenter}>
          <Text style={[styles.dayNavLabel, !isToday && { color: colors.accent1 }]}>
            {dayLabel}
          </Text>
          {!isToday && (
            <Text style={styles.dayNavDate}>
              {selectedDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={onNextDay} hitSlop={12} style={styles.dayNavArrow}>
          <Ionicons name="chevron-forward" size={22} color={colors.textOnDark} />
        </Pressable>
      </View>

      <ScrollFadeOverlay />
      <ScrollView
        style={styles.eventsScroll}
        contentContainerStyle={styles.flowContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        }
      >
        {/* ─── Player-only: Readiness + Balance ─── */}
        {isOwner && readiness && (
          <View style={styles.readinessBalanceRow}>
            <ReadinessRing score={readiness.score} level={readiness.level} size={72} />
            <View style={styles.balanceWrap}>
              <BalanceBar
                trainingHours={trainingHours ?? 0}
                academicHours={academicHours ?? 0}
                compact
              />
            </View>
          </View>
        )}

        {/* ─── Player-only: AI Balance Card ─── */}
        {isOwner && aiInsightText && (
          <View style={styles.aiCard}>
            <LinearGradient
              colors={['#A855F718', `${colors.accent1}18`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiCardGradient}
            >
              <View style={styles.aiHeader}>
                <Text style={styles.aiEmoji}>🧠</Text>
                <Text style={styles.aiLabel}>TOMO BALANCE</Text>
              </View>
              <Text style={styles.aiText}>{aiInsightText}</Text>
            </LinearGradient>
          </View>
        )}

        {/* ─── Player-only: Suggestions Banner ─── */}
        {isOwner && suggestions && suggestions.length > 0 && onSuggestionResolved && (
          <SuggestionsBanner
            suggestions={suggestions}
            onResolved={onSuggestionResolved}
          />
        )}

        {/* ─── FLOW Header + Pills ─── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderLabel}>{flowLabel}</Text>
          {isOwner && (
            <View style={styles.pillRow}>
              {/* Check-in pill (today only) */}
              {isToday && onCheckinPress && (
                <Pressable
                  onPress={() => !hasCheckedInToday && onCheckinPress()}
                  style={[
                    styles.checkinPill,
                    {
                      backgroundColor: hasCheckedInToday
                        ? `${colors.readinessGreen}18`
                        : `${colors.accent1}22`,
                      borderColor: hasCheckedInToday
                        ? `${colors.readinessGreen}33`
                        : `${colors.accent1}33`,
                    },
                  ]}
                >
                  <Ionicons
                    name={hasCheckedInToday ? 'checkmark-circle' : 'clipboard-outline'}
                    size={13}
                    color={hasCheckedInToday ? colors.readinessGreen : colors.accent1}
                  />
                  <Text
                    style={[
                      styles.checkinPillText,
                      { color: hasCheckedInToday ? colors.readinessGreen : colors.accent1 },
                    ]}
                  >
                    {hasCheckedInToday ? 'Checked In' : 'Check In'}
                  </Text>
                </Pressable>
              )}
              <LockInCard />
            </View>
          )}
        </View>

        {/* ─── Timeline ─── */}
        <View style={styles.timelineSection}>
          <FlowTimeline
            events={events}
            completedEventIds={completedEvents ?? emptyCompleted}
            onComplete={onComplete ?? noop}
            onSkip={onSkip ?? noop}
            onUndo={onUndo ?? noop}
            readOnly={!isOwner}
          />
        </View>

        {/* ─── Player-only: Exam Study Planner ─── */}
        {isOwner && upcomingExams && upcomingExams.length > 0 && (
          <ExamStudyPlanner exams={upcomingExams} />
        )}
      </ScrollView>

      {/* ─── FAB ─── */}
      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            onFabPress();
          }}
        >
          <LinearGradient
            colors={colors.gradientOrangeCyan}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Ionicons name={fabIcon as any} size={28} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ─── Day Navigation Bar ───
    dayNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.xs,
      marginBottom: spacing.xs,
    },
    dayNavArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNavCenter: {
      alignItems: 'center',
    },
    dayNavLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    dayNavDate: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },

    // ─── Flow Content ───
    eventsScroll: {
      flex: 1,
    },
    flowContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: layout.navHeight + spacing.xl + 70,
      gap: spacing.md,
    },
    timelineSection: {
      marginTop: spacing.xs,
    },

    // ─── Readiness + Balance ───
    readinessBalanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    balanceWrap: {
      flex: 1,
    },

    // ─── AI Balance Card ───
    aiCard: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#A855F733',
    },
    aiCardGradient: {
      padding: spacing.md,
    },
    aiHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    aiEmoji: {
      fontSize: 14,
    },
    aiLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      letterSpacing: 1,
      color: '#A855F7',
    },
    aiText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 20,
    },

    // ─── Section header row ───
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionHeaderLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 1.5,
    },
    pillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    // ─── Check-in pill ───
    checkinPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: borderRadius.full,
      borderWidth: 1,
    },
    checkinPillText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.3,
    },

    // ─── FAB ───
    fabWrap: {
      position: 'absolute',
      right: layout.screenMargin,
      bottom: spacing.lg,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.glowOrange,
    },
  });
}
