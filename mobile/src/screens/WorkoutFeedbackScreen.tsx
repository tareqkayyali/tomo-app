/**
 * Workout Feedback Screen
 * Submit feedback about today's workout
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, GradientCard, Slider } from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import { submitFeedback } from '../services/api';

export function WorkoutFeedbackScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const [didWorkout, setDidWorkout] = useState(true);
  const [intensity, setIntensity] = useState(5);
  const [followedPlan, setFollowedPlan] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [error, setError] = useState('');

  const getIntensityLabel = (val: number): string => {
    if (val <= 3) return 'LIGHT';
    if (val <= 6) return 'MODERATE';
    return 'HARD';
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const response = await submitFeedback({
        didWorkout,
        actualIntensity: didWorkout ? getIntensityLabel(intensity) : 'REST',
        followedPlan,
        notes: notes.trim() || undefined,
      });
      const points = response?.gamification?.progress?.totalPoints || 10;
      setPointsEarned(points);
      setSubmitted(true);
      setTimeout(() => navigation.goBack(), 2000);
    } catch (err) {
      setError('Could not submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <GradientCard style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={64} color="rgba(255,255,255,0.9)" />
            <Text style={styles.successTitle}>Feedback Submitted!</Text>
            <Text style={styles.successPoints}>+{pointsEarned} points earned</Text>
          </GradientCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Did you workout? */}
        <Card style={styles.card}>
          <Text style={styles.question}>Did you work out today?</Text>
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setDidWorkout(true)}
              style={[styles.toggleOption, didWorkout && styles.toggleYes]}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={didWorkout ? colors.textOnDark : colors.textMuted}
              />
              <Text style={[styles.toggleText, didWorkout && styles.toggleTextSelected]}>
                Yes
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDidWorkout(false)}
              style={[styles.toggleOption, !didWorkout && styles.toggleNo]}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={!didWorkout ? colors.textOnDark : colors.textMuted}
              />
              <Text style={[styles.toggleText, !didWorkout && styles.toggleTextSelected]}>
                No
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Intensity (if worked out) */}
        {didWorkout && (
          <Card style={styles.card}>
            <Slider
              label="How intense was your workout?"
              value={intensity}
              onChange={setIntensity}
              lowLabel="Very light"
              highLabel="Very hard"
            />
          </Card>
        )}

        {/* Followed plan? */}
        {didWorkout && (
          <Card style={styles.card}>
            <Text style={styles.question}>Did you follow the plan?</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setFollowedPlan(true)}
                style={[styles.toggleOption, followedPlan && styles.toggleYes]}
              >
                <Text style={[styles.toggleText, followedPlan && styles.toggleTextSelected]}>
                  Yes, fully
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFollowedPlan(false)}
                style={[styles.toggleOption, !followedPlan && styles.togglePartial]}
              >
                <Text style={[styles.toggleText, !followedPlan && styles.toggleTextSelected]}>
                  Partially / No
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Notes */}
        <Card style={styles.card}>
          <Text style={styles.question}>Any notes? (optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="How did your workout go?"
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Card>

        {error !== '' && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Button
          title="Submit Feedback"
          onPress={handleSubmit}
          loading={isSubmitting}
          variant="gradient"
          size="large"
          icon="send"
        />
      </ScrollView>
    </SafeAreaView>
  );
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
  card: {
    marginBottom: spacing.md,
  },
  question: {
    ...typography.h4,
    color: colors.textOnLight,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  toggleYes: {
    backgroundColor: colors.readinessGreen,
    borderColor: colors.readinessGreen,
  },
  toggleNo: {
    backgroundColor: colors.textMuted,
    borderColor: colors.textMuted,
  },
  togglePartial: {
    backgroundColor: colors.readinessYellow,
    borderColor: colors.readinessYellow,
  },
  toggleText: {
    ...typography.button,
    color: colors.textInactive,
  },
  toggleTextSelected: {
    color: colors.textOnDark,
  },
  notesInput: {
    ...typography.body,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textOnLight,
    minHeight: 80,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  successCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  successTitle: {
    ...typography.h2,
    color: colors.textOnDark,
    marginTop: spacing.md,
  },
  successPoints: {
    ...typography.h4,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.sm,
  },
});
