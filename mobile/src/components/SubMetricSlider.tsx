/**
 * SubMetricSlider — 1-10 numbered button row for rating shot sub-metrics.
 * Green → yellow → orange gradient, spring on selection.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../hooks/useAnimations';
import { colors, fontFamily, borderRadius, spacing } from '../theme';

interface SubMetricSliderProps {
  label: string;
  description?: string;
  value: number;
  onChange: (val: number) => void;
}

function NumberButton({
  num,
  isSelected,
  onPress,
}: {
  num: number;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useScaleOnPress(0.85);

  // Color gradient: 1-3 teal (growth), 4-5 orange, 6-7 yellow, 8-10 green
  const getColor = (n: number): string => {
    if (n >= 8) return '#2ECC71';
    if (n >= 6) return '#FFD60A';
    if (n >= 4) return '#FF9500';
    return '#3498DB';
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={[
          styles.numButton,
          isSelected && { backgroundColor: getColor(num), borderColor: getColor(num) },
        ]}
      >
        <Text
          style={[
            styles.numText,
            isSelected && styles.numTextSelected,
          ]}
        >
          {num}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function SubMetricSlider({
  label,
  description,
  value,
  onChange,
}: SubMetricSliderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {description && <Text style={styles.description}>{description}</Text>}

      <View style={styles.buttonRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
          <NumberButton
            key={num}
            num={num}
            isSelected={value === num}
            onPress={() => onChange(num)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
    marginBottom: 2,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  numButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  numText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  numTextSelected: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bold,
  },
});
