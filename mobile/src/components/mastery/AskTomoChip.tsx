/**
 * AskTomoChip — Standardized AI entry point button.
 * Used across all screens (Mastery, Vitals, Programs, Notifications).
 * Style: app background color, cream text, subtle cream border, rounded pill.
 */

import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface AskTomoChipProps {
  label?: string;
  prompt: string;
  onPress: (prompt: string) => void;
}

const AskTomoChip: React.FC<AskTomoChipProps> = memo(({ label, prompt, onPress }) => {
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(prompt);
  }, [prompt, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: colors.background,
          borderColor: colors.creamMuted,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SmartIcon name="chatbubble-ellipses-outline" size={14} color={colors.textPrimary} />
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        {label || 'Ask Tomo about this'}
      </Text>
    </Pressable>
  );
});

AskTomoChip.displayName = 'AskTomoChip';

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.compact,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
});

export { AskTomoChip };
