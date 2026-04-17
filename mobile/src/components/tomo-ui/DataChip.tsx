/**
 * DataChip — Small stat display (value + label) for attribute grids.
 */
import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { borderRadius, animation } from '../../theme/spacing';

export interface DataChipProps {
  /** Display value (e.g. "85") */
  value: string;
  /** Label below (e.g. "PAC") */
  label: string;
  /** Accent color for value text */
  accentColor?: string;
  /** Entrance stagger index */
  enterIndex?: number;
}

const DataChip: React.FC<DataChipProps> = memo(({
  value,
  label,
  accentColor,
  enterIndex = 0,
}) => {
  const { colors } = useTheme();
  const enterDelay = enterIndex * animation.stagger.default;

  return (
    <Animated.View
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.value, { color: accentColor ?? colors.chalk }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.chalkDim }]}>{label}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  value: {
    fontFamily: fontFamily.display,
    fontSize: 16,
  },
  label: {
    fontFamily: fontFamily.note,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

DataChip.displayName = 'DataChip';

export default DataChip;
