/**
 * FocusHero — Signal Dashboard above-the-fold section.
 *
 * Replaces the old AthleteModeHero + DailyRecommendations stack with a single
 * snapshot-first surface: readiness ring + one-sentence coaching line. The
 * halo is a sinusoidally-pulsing radial blob top-right to give the card
 * subtle life without motion-distraction.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import { ReadinessRing } from './ReadinessRing';

interface Props {
  readiness: number; // 0–100
  modeLabel: string; // e.g. "BALANCED", "PERFORMANCE", "RECOVERY"
  coachingMessage: string;
  /**
   * Optional single word in the coaching message to highlight in sage-light.
   * Case-insensitive. If absent or not found in the message, the message
   * renders plain.
   */
  highlightWord?: string;
}

export function FocusHero({ readiness, modeLabel, coachingMessage, highlightWord }: Props) {
  const { colors } = useTheme();

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.2,
  }));

  const parts = splitHighlight(coachingMessage, highlightWord);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.accentSubtle, borderColor: colors.accentBorder },
      ]}
    >
      <LinearGradient
        colors={[colors.accentMuted, colors.surface]}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      <Animated.View
        style={[styles.halo, haloStyle, { pointerEvents: 'none' }]}
      >
        <LinearGradient
          colors={[colors.accentSoft, 'rgba(122,155,118,0)']}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={styles.haloGradient}
        />
      </Animated.View>

      <View style={styles.row}>
        <ReadinessRing value={readiness} />
        <View style={styles.textCol}>
          <Text style={[styles.eyebrow, { color: colors.accentLight }]}>
            {`TODAY · ${modeLabel.toUpperCase()}`}
          </Text>
          <Text style={[styles.body, { color: colors.textPrimary }]}>
            {parts.before}
            {parts.highlight ? (
              <Text style={[styles.highlight, { color: colors.accentLight }]}>
                {parts.highlight}
              </Text>
            ) : null}
            {parts.after}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Splits a coaching sentence into [before][highlight][after] around the first
 * case-insensitive match of `word`. Preserves spacing. Falls back to whole
 * message in `before` when the word isn't present.
 */
function splitHighlight(msg: string, word: string | undefined): {
  before: string;
  highlight: string;
  after: string;
} {
  if (!word) return { before: msg, highlight: '', after: '' };
  const idx = msg.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) return { before: msg, highlight: '', after: '' };
  return {
    before: msg.slice(0, idx),
    highlight: msg.slice(idx, idx + word.length),
    after: msg.slice(idx + word.length),
  };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  haloGradient: {
    flex: 1,
    borderRadius: 80,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textCol: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  highlight: {
    fontFamily: fontFamily.medium,
  },
});
