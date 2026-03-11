/**
 * SportSwitcher — Segmented control for switching between active sports.
 *
 * Design: Glass morphism pill (85% opacity, 1px charcoal border on dark)
 * with two equal-weight segments. Active segment fills with the sport's
 * accent color; inactive uses muted text. 36px tall, full pill radius.
 *
 * Renders ONLY when the user has 2+ sports configured (reads
 * hasMultipleSports from SportContext). Returns null otherwise.
 *
 * Placement: Below header, above content on sport-SPECIFIC screens
 * (Progress, Tests, Skills). Never shown on sport-agnostic screens
 * (Calendar, Check-in, Readiness).
 *
 * Research basis (Multi-Sport UX):
 * - Strava model: single feed, sport type per activity, stats filtered
 *   by sport in analytics.
 * - Primary + Secondary pattern: football as "home", padel as module.
 * - Never show the switcher on sport-agnostic screens to avoid confusion.
 *
 * Psychology (SDT — Autonomy):
 * - Both sports displayed with equal visual weight.
 * - No "primary/secondary" hierarchy in the switcher itself.
 * - Switching is instant and fluid — no loading states, no confirmations.
 * - Light haptic impact feedback on switch for tactile confirmation.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useSportContext, type ActiveSport } from '../../hooks/useSportContext';
import { fontFamily, spacing } from '../../theme';

// ═══ SPORT DEFINITIONS ═══

/** Static metadata for each supported sport in the switcher. */
const SPORT_META: Record<ActiveSport, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  gradientEnd: string;
}> = {
  football: {
    label: 'Football',
    icon: 'football-outline',
    color: '#30D158',
    gradientEnd: '#1A8E3A',
  },
  padel: {
    label: 'Padel',
    icon: 'tennisball-outline',
    color: '#FF6B35',
    gradientEnd: '#CC5529',
  },
};

/** Order of segments — both sports are visually equal. */
const SPORT_ORDER: ActiveSport[] = ['football', 'padel'];

// ═══ COMPONENT ═══

interface SportSwitcherProps {
  /** Currently active sport */
  activeSport: ActiveSport;
  /** Called when the user taps a different sport segment */
  onSportChange: (sport: ActiveSport) => void;
}

/**
 * Segmented control for switching the active sport.
 *
 * Automatically hides when the user has only one sport configured.
 * Uses glass morphism styling from the Tomo theme and provides
 * haptic feedback on sport switch.
 */
export function SportSwitcher({ activeSport, onSportChange }: SportSwitcherProps) {
  const { hasMultipleSports } = useSportContext();
  const { colors } = useTheme();

  // Don't render if user has only one sport
  if (!hasMultipleSports) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassBorder,
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Sport selector"
    >
      {SPORT_ORDER.map((sport) => (
        <Segment
          key={sport}
          sport={sport}
          isActive={activeSport === sport}
          onPress={onSportChange}
        />
      ))}
    </View>
  );
}

// ═══ SEGMENT ═══

interface SegmentProps {
  sport: ActiveSport;
  isActive: boolean;
  onPress: (sport: ActiveSport) => void;
}

/**
 * Individual segment within the switcher.
 * Active segment renders a gradient fill with sport accent color.
 * Inactive segment renders with muted text.
 * Spring scale animation on press for tactile feel.
 */
function Segment({ sport, isActive, onPress }: SegmentProps) {
  const { colors: themeColors } = useTheme();
  const meta = SPORT_META[sport];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 150 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, []);

  const handlePress = useCallback(() => {
    if (isActive) return; // No-op when already selected
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(sport);
  }, [isActive, onPress, sport]);

  return (
    <Animated.View style={[styles.segmentWrapper, animatedStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.segmentPressable}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${meta.label} sport`}
      >
        {isActive ? (
          <LinearGradient
            colors={[meta.color, meta.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.segmentActive}
          >
            <Ionicons name={meta.icon} size={14} color="#FFFFFF" />
            <Text style={styles.segmentTextActive}>{meta.label}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.segmentInactive}>
            <Ionicons name={meta.icon} size={14} color={themeColors.textInactive} />
            <Text style={[styles.segmentTextInactive, { color: themeColors.textInactive }]}>
              {meta.label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ═══ STYLES ═══

const SWITCHER_HEIGHT = 36;
const SWITCHER_RADIUS = 18; // height / 2 = full pill

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: SWITCHER_HEIGHT,
    borderRadius: SWITCHER_RADIUS,
    borderWidth: 1,
    padding: 2,
    alignSelf: 'center',
  },
  segmentWrapper: {
    flex: 1,
  },
  segmentPressable: {
    flex: 1,
  },
  segmentActive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SWITCHER_RADIUS - 2,
    gap: 6,
    paddingHorizontal: spacing.md,
  },
  segmentInactive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SWITCHER_RADIUS - 2,
    gap: 6,
    paddingHorizontal: spacing.md,
  },
  segmentTextActive: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  segmentTextInactive: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
});
