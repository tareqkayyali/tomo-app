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
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { SphereButton } from '../tomo-ui/SphereButton';

interface AskTomoChipProps {
  label?: string;
  prompt: string;
  /** If provided, called instead of auto-navigating to Chat */
  onPress?: (prompt: string) => void;
  /** Remove default marginTop (for inline placement) */
  noMargin?: boolean;
}

const AskTomoChip: React.FC<AskTomoChipProps> = memo(({ label, prompt, onPress, noMargin }) => {
  const navigation = useNavigation<any>();

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onPress) {
      onPress(prompt);
    } else {
      try {
        navigation.navigate('Main', {
          screen: 'MainTabs',
          params: { screen: 'Chat', params: { prefillMessage: prompt, autoSend: true } },
        });
      } catch {
        navigation.navigate('Chat', { prefillMessage: prompt, autoSend: true });
      }
    }
  }, [prompt, onPress, navigation]);

  return (
    <SphereButton
      label={label || 'Ask Tomo about this'}
      onPress={handlePress}
      style={noMargin ? undefined : { marginTop: 8 }}
    />
  );
});

AskTomoChip.displayName = 'AskTomoChip';

export { AskTomoChip };
