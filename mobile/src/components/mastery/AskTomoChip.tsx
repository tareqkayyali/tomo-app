/**
 * AskTomoChip — Pervasive AI entry point pill button.
 * Used at every Mastery section to send contextual prompts to Tomo AI Chat.
 */

import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
          backgroundColor: pressed ? `${colors.accent}14` : `${colors.accent}14`,
          borderColor: `${colors.accent}33`,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name="chatbubble-outline" size={14} color={colors.accent} />
      <Text style={[styles.text, { color: colors.accent }]}>
        {label || 'Ask Tomo'}
      </Text>
    </Pressable>
  );
});

AskTomoChip.displayName = 'AskTomoChip';

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginTop: spacing.compact,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});

export { AskTomoChip };
