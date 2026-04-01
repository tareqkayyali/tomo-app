/**
 * CoachNote — The signature "personal coach" component.
 *
 * Shows readiness status with a pulsing dot, handwritten status text,
 * and a coach message card with the "— Tomo" signature.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius, animation } from '../../theme/spacing';

export interface CoachNoteProps {
  /** Readiness score 0-100 */
  readinessScore: number;
  /** Coach's personalized message */
  coachMessage: string;
  /** Signoff text — default "— Tomo" */
  signoff?: string;
  /** Entrance animation delay */
  enterIndex?: number;
}

/** Map readiness score to status label */
function getReadinessLabel(score: number): string {
  if (score >= 80) return 'You\'re on fire';
  if (score >= 71) return 'Good to go';
  if (score >= 55) return 'Take it steady';
  if (score >= 41) return 'Listen to your body';
  if (score >= 20) return 'Recovery day';
  return 'Rest is training too';
}

/** Map readiness score to color */
function getReadinessColor(score: number, colors: any): string {
  if (score >= 71) return colors.readinessGreen;
  if (score >= 41) return colors.readinessYellow;
  return colors.readinessRed;
}

const CoachNote: React.FC<CoachNoteProps> = memo(({
  readinessScore,
  coachMessage,
  signoff = '— Tomo',
  enterIndex = 0,
}) => {
  const { colors } = useTheme();
  const dotGlow = useSharedValue(0.4);

  const readinessColor = useMemo(
    () => getReadinessColor(readinessScore, colors),
    [readinessScore, colors],
  );
  const readinessLabel = useMemo(
    () => getReadinessLabel(readinessScore),
    [readinessScore],
  );

  // Pulsing dot animation
  useEffect(() => {
    dotGlow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    shadowOpacity: dotGlow.value,
  }));

  const enterDelay = enterIndex * animation.stagger.default;

  return (
    <Animated.View
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      style={[styles.container, { backgroundColor: colors.surfaceWarm, borderColor: colors.chalkGhost }]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.chalkDim }]}>
          Today's readiness
        </Text>
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: readinessColor, shadowColor: readinessColor },
              dotStyle,
            ]}
          />
          <Text style={[styles.statusText, { color: readinessColor }]}>
            {readinessLabel}
          </Text>
        </View>
      </View>

      {/* Coach message */}
      <View style={[styles.messageCard, { backgroundColor: colors.coachNoteBackground, borderLeftColor: colors.coachNoteBorder }]}>
        <Text style={[styles.message, { color: colors.chalk }]}>
          {coachMessage}
        </Text>
        <Text style={[styles.signoff, { color: colors.coachSignature }]}>
          {signoff}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg + 4,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  label: {
    fontFamily: fontFamily.note,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 4,
  },
  statusText: {
    fontFamily: fontFamily.display,
    fontSize: 20,
  },
  messageCard: {
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    padding: spacing.compact,
  },
  message: {
    fontFamily: fontFamily.note,
    fontSize: 15,
    lineHeight: 22,
  },
  signoff: {
    fontFamily: fontFamily.displayRegular,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'right',
  },
});

CoachNote.displayName = 'CoachNote';

export default CoachNote;
