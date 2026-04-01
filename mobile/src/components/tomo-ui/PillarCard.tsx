/**
 * PillarCard — Mastery pillar with Phosphor icon, coach subtitle, and progress bar.
 *
 * Each pillar has its own accent color and a one-liner subtitle
 * that reads like a coach's note ("Keep your engine running").
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius, animation } from '../../theme/spacing';
import TomoIcon from './TomoIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PillarCardProps {
  /** Pillar name (e.g. "Endurance") */
  name: string;
  /** Score 0-100 */
  score: number;
  /** Coach one-liner (e.g. "Keep your engine running") */
  subtitle: string;
  /** TomoIcon name (e.g. 'endurance', 'strength') */
  icon: string;
  /** Accent color for icon bg, bar fill, score text */
  accentColor: string;
  /** Accent background color (10% opacity version) */
  accentBg: string;
  /** Press handler */
  onPress?: () => void;
  /** Stagger index for entrance animation */
  enterIndex?: number;
}

const PillarCard: React.FC<PillarCardProps> = memo(({
  name,
  score,
  subtitle,
  icon,
  accentColor,
  accentBg,
  onPress,
  enterIndex = 0,
}) => {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const barWidth = useSharedValue(0);

  // Animate bar fill on mount
  useEffect(() => {
    barWidth.value = withDelay(
      enterIndex * animation.stagger.default + 200,
      withTiming(score, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, [score, enterIndex]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as any,
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(animation.press.card, animation.spring.snappy);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, animation.spring.snappy);
  };
  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const enterDelay = enterIndex * animation.stagger.default;

  return (
    <AnimatedPressable
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      onPress={onPress ? handlePress : undefined}
      onPressIn={onPress ? handlePressIn : undefined}
      onPressOut={onPress ? handlePressOut : undefined}
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.chalkGhost },
        pressStyle,
      ]}
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: accentBg }]}>
        <TomoIcon name={icon} size={22} color={accentColor} />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.chalk }]}>{name}</Text>
        <Text style={[styles.subtitle, { color: colors.chalkDim }]}>{subtitle}</Text>
        <View style={[styles.barTrack, { backgroundColor: colors.chalkGhost }]}>
          <Animated.View
            style={[
              styles.barFill,
              { backgroundColor: accentColor, shadowColor: accentColor },
              barStyle,
            ]}
          />
        </View>
      </View>

      {/* Score */}
      <Text style={[styles.score, { color: accentColor }]}>{score}</Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  score: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    flexShrink: 0,
    minWidth: 32,
    textAlign: 'right',
  },
});

PillarCard.displayName = 'PillarCard';

export default PillarCard;
