/**
 * TomoLoader — Shared dynamic loading indicator.
 *
 * Cycles through contextual messages with icons every 1.8s.
 * Used for all full-screen loading states across the app.
 * Pass custom messages for context-specific loading, or use defaults.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';
import { useTheme } from '../hooks/useTheme';
import { fontFamily, spacing, borderRadius } from '../theme';

export interface LoaderMessage {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const DEFAULT_MESSAGES: LoaderMessage[] = [
  { title: 'Loading', subtitle: 'Getting things ready...', icon: 'sparkles-outline' },
  { title: 'Syncing Data', subtitle: 'Pulling your latest info...', icon: 'sync-outline' },
  { title: 'Almost Ready', subtitle: 'Just a moment...', icon: 'rocket-outline' },
];

export const CHAT_LOADER_MESSAGES: LoaderMessage[] = [
  { title: 'Starting Tomo', subtitle: 'Your AI coach is warming up...', icon: 'sparkles-outline' },
  { title: 'Loading Conversations', subtitle: 'Pulling your recent chats...', icon: 'chatbubbles-outline' },
  { title: 'Checking Your Status', subtitle: 'Readiness, streak, schedule...', icon: 'pulse-outline' },
  { title: 'Syncing Data', subtitle: 'Tests, training, recovery...', icon: 'sync-outline' },
  { title: 'Almost Ready', subtitle: 'Setting up your command center...', icon: 'rocket-outline' },
];

export const NOTIFICATIONS_LOADER_MESSAGES: LoaderMessage[] = [
  { title: 'Loading Notifications', subtitle: 'Fetching your alerts...', icon: 'notifications-outline' },
  { title: 'Checking Priorities', subtitle: 'Sorting by urgency...', icon: 'flash-outline' },
  { title: 'Almost Ready', subtitle: 'Just a moment...', icon: 'checkmark-circle-outline' },
];

export const OUTPUT_LOADER_MESSAGES: LoaderMessage[] = [
  { title: 'Loading Metrics', subtitle: 'Fetching your performance data...', icon: 'stats-chart-outline' },
  { title: 'Crunching Numbers', subtitle: 'Calculating your scores...', icon: 'calculator-outline' },
  { title: 'Almost Ready', subtitle: 'Pulling it all together...', icon: 'rocket-outline' },
];

export const PLAN_LOADER_MESSAGES: LoaderMessage[] = [
  { title: 'Building Your Plan', subtitle: 'Analysing your schedule...', icon: 'calendar-outline' },
  { title: 'Checking Load', subtitle: 'Balancing training and recovery...', icon: 'pulse-outline' },
  { title: 'Almost Ready', subtitle: 'Your plan is almost set...', icon: 'checkmark-circle-outline' },
];

interface TomoLoaderProps {
  messages?: LoaderMessage[];
}

export function TomoLoader({ messages = DEFAULT_MESSAGES }: TomoLoaderProps) {
  const { colors } = useTheme();
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % messages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [messages.length]);

  const msg = messages[idx];

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.accent2}12` }]}>
        <SmartIcon name={msg.icon} size={26} color={colors.accent2} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{msg.title}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{msg.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: 'center',
  },
});
