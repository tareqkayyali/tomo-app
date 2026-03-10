/**
 * Slider Component
 * Rating slider for check-in with scale animation
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography, fontFamily } from '../theme';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
}

const { width } = Dimensions.get('window');
const BUTTON_SIZE = Math.min((width - spacing.lg * 2 - spacing.xs * 9) / 10, 36);

function SliderButton({
  v,
  selected,
  color,
  onPress,
}: {
  v: number;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1.15 : 1, { damping: 15 }) }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        style={[
          styles.button,
          selected && { backgroundColor: color, borderColor: color },
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            selected && styles.buttonTextSelected,
          ]}
        >
          {v}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  lowLabel,
  highLabel,
}: SliderProps) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  const getColor = (v: number) => {
    const range = max - min;
    const normalized = (v - min) / range;
    if (normalized <= 0.3) return colors.readinessGreen;
    if (normalized <= 0.6) return colors.readinessYellow;
    return colors.readinessRed;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.sliderRow}>
        {values.map((v) => (
          <SliderButton
            key={v}
            v={v}
            selected={value === v}
            color={getColor(v)}
            onPress={() => onChange(v)}
          />
        ))}
      </View>
      <View style={styles.labelsRow}>
        {lowLabel && <Text style={styles.rangeLabel}>{lowLabel}</Text>}
        <View style={styles.spacer} />
        {highLabel && <Text style={styles.rangeLabel}>{highLabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textOnLight,
    marginBottom: spacing.sm,
    fontFamily: fontFamily.semiBold,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.cardLight,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.caption,
    color: colors.textInactive,
    fontFamily: fontFamily.semiBold,
  },
  buttonTextSelected: {
    color: colors.textOnDark,
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  rangeLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  spacer: {
    flex: 1,
  },
});
