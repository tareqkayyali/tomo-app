/**
 * Today Screen
 * Main home screen showing today's plan and status
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  ReadinessBadge,
  StreakBadge,
  ProgressBar,
  GradientCard,
  SkeletonCard,
  ErrorState,
} from '../components';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import { getToday } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useFadeIn } from '../hooks/useFadeIn';
import type { Plan, Checkin, ProgressData } from '../types';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

type TodayScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Chat'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

interface TodayData {
  checkin: Checkin | null;
  plan: Plan | null;
  progress: ProgressData | null;
  needsCheckin: boolean;
}

export function TodayScreen({ navigation }: TodayScreenProps) {
  const { profile } = useAuth();
  const [data, setData] = useState<TodayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backendError, setBackendError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await getToday();
      setData({
        checkin: response.checkin,
        plan: response.plan,
        progress: response.progress,
        needsCheckin: response.needsCheckin,
      });
      setBackendError(false);
    } catch (error) {
      setBackendError(true);
      setData({
        checkin: null,
        plan: null,
        progress: {
          currentStreak: profile?.currentStreak || 0,
          longestStreak: profile?.longestStreak || 0,
          totalPoints: profile?.totalPoints || 0,
          weeklyPoints: 0,
          streakMultiplier: profile?.streakMultiplier || 1,
          totalCheckIns: 0,
        },
        needsCheckin: true,
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Hooks must be called before any early return
  const fadeIn0 = useFadeIn(0);
  const fadeIn1 = useFadeIn(1);
  const fadeIn2 = useFadeIn(2);
  const fadeIn3 = useFadeIn(3);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { checkin, plan, progress, needsCheckin } = data || {};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <Animated.View style={[styles.header, fadeIn0]}>
          <View>
            <Text style={styles.greeting}>
              Hey {profile?.displayName || profile?.name || 'Athlete'}!
            </Text>
            <Text style={styles.date}>{formatDate(new Date())}</Text>
          </View>
          {progress && (
            <StreakBadge
              streak={progress.currentStreak}
              multiplier={progress.streakMultiplier}
              size="small"
            />
          )}
        </Animated.View>

        {/* Backend Error */}
        {backendError && (
          <ErrorState
            message="Unable to connect to server. Some features may be limited."
            onRetry={loadData}
            compact
          />
        )}

        {/* Check-in Prompt or Readiness */}
        {needsCheckin ? (
          <Animated.View style={fadeIn1}>
          <GradientCard style={styles.checkinPrompt}>
            <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.9)" />
            <Text style={styles.checkinTitle}>Ready for your check-in?</Text>
            <Text style={styles.checkinSubtitle}>
              Quick 10-second check to get your personalized plan
            </Text>
            <Button
              title="Start Check-in"
              onPress={() => navigation.navigate('Checkin')}
              variant="outline"
              style={styles.checkinButton}
              textStyle={{ color: colors.textOnDark }}
            />
          </GradientCard>
          </Animated.View>
        ) : plan ? (
          <>
            {/* Readiness Card */}
            <Animated.View style={fadeIn1}>
            <Card variant="elevated" style={styles.readinessCard}>
              <View style={styles.readinessHeader}>
                <Text style={styles.readinessTitle}>Today's Readiness</Text>
                <ReadinessBadge
                  level={plan.readinessLevel as 'GREEN' | 'YELLOW' | 'RED'}
                  size="medium"
                />
              </View>
              <Text style={styles.recommendation}>{plan.recommendation}</Text>
              {plan.decisionExplanation && (
                <Text style={styles.explanation}>
                  {typeof plan.decisionExplanation === 'string'
                    ? plan.decisionExplanation
                    : plan.decisionExplanation.summary}
                </Text>
              )}
            </Card>
            </Animated.View>

            {/* Plan Card */}
            <Animated.View style={fadeIn2}>
            <Card variant="elevated" style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planTitle}>Your Plan</Text>
                <View style={[styles.intensityBadge, getIntensityStyle(plan.recommendedIntensity)]}>
                  <Text style={styles.intensityText}>{plan.recommendedIntensity}</Text>
                </View>
              </View>

              {plan.exercises && plan.exercises.length > 0 ? (
                <View style={styles.exercises}>
                  {plan.exercises.map((exercise, index) => (
                    <View key={index} style={styles.exerciseItem}>
                      <Ionicons name="fitness-outline" size={16} color={colors.accent1} style={styles.exerciseIcon} />
                      <View style={styles.exerciseContent}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        <Text style={styles.exerciseDetail}>
                          {exercise.sets && `${exercise.sets} sets`}
                          {exercise.reps && ` x ${exercise.reps} reps`}
                          {exercise.duration && ` | ${exercise.duration}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.restMessage}>
                  {plan.readinessLevel === 'RED'
                    ? 'Focus on recovery today. Light stretching or a walk is perfect.'
                    : 'Your coach will provide specific exercises.'}
                </Text>
              )}

              <Button
                title="Complete Workout"
                onPress={() => navigation.navigate('WorkoutFeedback')}
                variant="gradient"
                icon="checkmark-circle"
                style={styles.completeButton}
              />
            </Card>
            </Animated.View>

            {/* Points Card */}
            {progress && (
              <Animated.View style={fadeIn3}>
              <Card style={styles.pointsCard}>
                <View style={styles.pointsRow}>
                  <View style={styles.pointsStat}>
                    <Text style={styles.pointsValue}>{progress.totalPoints}</Text>
                    <Text style={styles.pointsLabel}>Total Points</Text>
                  </View>
                  <View style={styles.pointsDivider} />
                  <View style={styles.pointsStat}>
                    <Text style={styles.pointsValue}>{progress.weeklyPoints}</Text>
                    <Text style={styles.pointsLabel}>This Week</Text>
                  </View>
                </View>
                <ProgressBar
                  progress={(progress.weeklyPoints % 100) / 100}
                  label="Next Milestone"
                  showPercentage
                  style={styles.progressBar}
                />
              </Card>
              </Animated.View>
            )}
          </>
        ) : (
          <Animated.View style={fadeIn1}>
          <GradientCard style={styles.welcomeCard}>
            <Ionicons name="hand-right-outline" size={48} color="rgba(255,255,255,0.9)" />
            <Text style={styles.welcomeTitle}>Welcome to Tomo!</Text>
            <Text style={styles.welcomeText}>
              Start your daily check-in to get personalized training recommendations.
            </Text>
            <Button
              title="Start Check-in"
              onPress={() => navigation.navigate('Checkin')}
              variant="outline"
              style={styles.checkinButton}
              textStyle={{ color: colors.textOnDark }}
            />
          </GradientCard>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getIntensityStyle(intensity: string) {
  switch (intensity) {
    case 'HARD':
      return { backgroundColor: colors.intensityHardBg };
    case 'MODERATE':
      return { backgroundColor: colors.intensityModerateBg };
    case 'LIGHT':
      return { backgroundColor: colors.intensityLightBg };
    case 'REST':
      return { backgroundColor: colors.intensityRestBg };
    default:
      return { backgroundColor: colors.border };
  }
}

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    ...typography.h3,
    color: colors.textOnLight,
  },
  date: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  checkinPrompt: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  checkinTitle: {
    ...typography.h3,
    color: colors.textOnDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  checkinSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  checkinButton: {
    minWidth: 200,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  welcomeCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  welcomeTitle: {
    ...typography.h3,
    color: colors.textOnDark,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  welcomeText: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  readinessCard: {
    marginBottom: spacing.md,
  },
  readinessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  readinessTitle: {
    ...typography.h4,
    color: colors.textOnLight,
  },
  recommendation: {
    ...typography.bodyMedium,
    color: colors.textOnLight,
  },
  explanation: {
    ...typography.body,
    color: colors.textInactive,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  planCard: {
    marginBottom: spacing.md,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  planTitle: {
    ...typography.h4,
    color: colors.textOnLight,
  },
  intensityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  intensityText: {
    ...typography.caption,
    fontFamily: fontFamily.semiBold,
    color: colors.textOnLight,
  },
  exercises: {
    gap: spacing.sm,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  exerciseIcon: {
    marginTop: 3,
    marginRight: spacing.sm,
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseName: {
    ...typography.bodyMedium,
    color: colors.textOnLight,
  },
  exerciseDetail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  completeButton: {
    marginTop: spacing.lg,
  },
  restMessage: {
    ...typography.body,
    color: colors.textInactive,
    fontStyle: 'italic',
  },
  pointsCard: {
    marginBottom: spacing.md,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pointsStat: {
    flex: 1,
    alignItems: 'center',
  },
  pointsValue: {
    ...typography.h2,
    color: colors.accent1,
  },
  pointsLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pointsDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  progressBar: {
    marginTop: spacing.sm,
  },
});
