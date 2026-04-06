/**
 * SportSelector — 2×2 grid of big icon cards for sport selection.
 * Selected sport gets gradient border + scale glow.
 * Non-available sports show "Coming Soon" overlay.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { SmartIcon } from './SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useScaleOnPress, useSpringEntrance } from '../hooks/useAnimations';
import { useSportOptions } from '../hooks/useContentHelpers';
import { colors, fontFamily, borderRadius, spacing } from '../theme';

type SportOption = { value: string; label: string; icon: string; color: string; available: boolean };

interface SportSelectorProps {
  selected: string;
  onSelect: (sport: string) => void;
}

function SportCard({
  option,
  isSelected,
  onSelect,
  index,
}: {
  option: SportOption;
  isSelected: boolean;
  onSelect: (sport: string) => void;
  index: number;
}) {
  const { animatedStyle: scaleStyle, onPressIn, onPressOut } = useScaleOnPress();
  const entranceStyle = useSpringEntrance(index, 50);

  return (
    <Animated.View style={[entranceStyle, scaleStyle, styles.cardWrapper]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => option.available && onSelect(option.value)}
        style={styles.cardPressable}
      >
        {isSelected ? (
          <LinearGradient
            colors={[option.color, `${option.color}88`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, styles.cardSelected]}
          >
            <SmartIcon name={option.icon as any} size={40} color="#F5F3ED" />
            <Text style={styles.cardLabel}>{option.label}</Text>
            <View style={styles.checkBadge}>
              <SmartIcon name="checkmark-circle" size={18} color="#F5F3ED" />
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.card, !option.available && styles.cardDisabled]}>
            <SmartIcon
              name={option.icon as any}
              size={40}
              color={option.available ? option.color : colors.textInactive}
            />
            <Text
              style={[
                styles.cardLabel,
                !option.available && styles.cardLabelDisabled,
              ]}
            >
              {option.label}
            </Text>
            {!option.available && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function SportSelector({ selected, onSelect }: SportSelectorProps) {
  const sportOptions = useSportOptions();
  return (
    <View style={styles.grid}>
      {sportOptions.map((option, index) => (
        <SportCard
          key={option.value}
          option={option}
          isSelected={selected === option.value}
          onSelect={onSelect}
          index={index}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardWrapper: {
    width: '47%',
  },
  cardPressable: {
    borderRadius: borderRadius.lg,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    minHeight: 120,
    position: 'relative',
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: 'rgba(245,243,237,0.3)',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textOnDark,
    marginTop: spacing.sm,
  },
  cardLabelDisabled: {
    color: colors.textInactive,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  comingSoonBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: colors.creamSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  comingSoonText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textInactive,
  },
});
