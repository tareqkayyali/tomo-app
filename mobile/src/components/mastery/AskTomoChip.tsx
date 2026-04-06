/**
 * AskTomoChip — THE single unified AI entry point button.
 * Used across ALL screens (Mastery, Vitals, Programs, Notifications, Own It).
 * Style: Glossy sage green pill matching the Chat tab button.
 *
 * Usage:
 *   <AskTomoChip prompt="Analyze my sprint" />              // auto-navigates to Chat
 *   <AskTomoChip prompt="..." onPress={customHandler} />    // custom handler
 *   <AskTomoChip prompt="..." label="Ask about X" />        // custom label
 */

import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, Pressable, Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface AskTomoChipProps {
  label?: string;
  prompt: string;
  /** If provided, called instead of auto-navigating to Chat */
  onPress?: (prompt: string) => void;
  /** Remove default marginTop (for inline placement) */
  noMargin?: boolean;
}

const AskTomoChip: React.FC<AskTomoChipProps> = memo(({ label, prompt, onPress, noMargin }) => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onPress) {
      onPress(prompt);
    } else {
      // Auto-navigate to Chat with prefilled message
      try {
        navigation.navigate('Main', {
          screen: 'MainTabs',
          params: { screen: 'Chat', params: { prefillMessage: prompt, autoSend: true } },
        });
      } catch {
        // Fallback for different navigator structures
        navigation.navigate('Chat', { prefillMessage: prompt, autoSend: true });
      }
    }
  }, [prompt, onPress, navigation]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chip,
        noMargin && { marginTop: 0 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Base gradient: sage green */}
      <LinearGradient
        colors={[colors.accentLight, colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: borderRadius.full }]}
      />
      {/* Glass shine overlay */}
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.06)', 'transparent']}
        locations={[0, 0.35, 0.65]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: borderRadius.full }]}
      />
      {/* Inner border highlight */}
      <View style={styles.innerBorder} />
      <SmartIcon name="chatbubble-ellipses-outline" size={14} color={colors.background} />
      <Text style={[styles.text, { color: colors.background }]}>
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
    borderRadius: borderRadius.full,
    marginTop: spacing.compact,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
});

export { AskTomoChip };
