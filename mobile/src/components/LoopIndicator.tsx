/**
 * Loop Indicator — 4-step daily progress tracker
 *
 * Steps: Plan → Test → Progress → For You
 * Each step fills when the user visits that tab.
 * Completing all 4 triggers a "+25 bonus points" banner.
 *
 * From the approved Tomo prototype (LoopIndicator component).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, fontFamily } from '../theme';

const STEPS = ['Plan', 'Test', 'Progress', 'For You'] as const;

type LoopIndicatorProps = {
  /** Which steps are complete (array of 4 booleans) */
  steps: boolean[];
  /** Called when user taps a step */
  onStepPress?: (index: number) => void;
};

export function LoopIndicator({ steps, onStepPress }: LoopIndicatorProps) {
  return (
    <View style={styles.container}>
      {STEPS.map((label, i) => {
        const done = steps[i];
        return (
          <React.Fragment key={label}>
            <TouchableOpacity
              style={styles.step}
              onPress={() => onStepPress?.(i)}
              activeOpacity={0.7}
            >
              {/* Dot */}
              <View
                style={[
                  styles.dot,
                  done ? styles.dotDone : styles.dotPending,
                ]}
              >
                {done && (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                )}
              </View>
              {/* Label */}
              <Text
                style={[
                  styles.label,
                  { color: done ? colors.accent1 : colors.textDisabled },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>

            {/* Connecting line (between steps, not after last) */}
            {i < STEPS.length - 1 && (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor:
                      done && steps[i + 1]
                        ? colors.accent1
                        : colors.border,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Completion Banner ────────────────────────────────────────────────
export function LoopCompleteBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Text style={{ fontSize: 16 }}>🎉</Text>
      <Text style={styles.bannerText}>Loop Complete! +25 bonus points</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },

  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: colors.accent1,
  },
  dotPending: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.textDisabled,
  },

  label: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
  },

  line: {
    width: 16,
    height: 1,
  },

  // ── Banner ─────────────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: `${colors.readinessGreen}22`,
    borderWidth: 1,
    borderColor: `${colors.readinessGreen}44`,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    color: colors.readinessGreen,
  },
});
