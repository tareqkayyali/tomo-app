import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LOADING_MESSAGES = [
  { title: 'Signing you in', subtitle: 'Verifying your athlete account...', icon: 'person-outline' as const },
  { title: 'Preparing AI Coach', subtitle: 'Tomo is getting ready for you...', icon: 'sparkles-outline' as const },
  { title: 'Syncing Training Data', subtitle: 'Pulling your latest sessions...', icon: 'barbell-outline' as const },
  { title: 'Checking Readiness', subtitle: 'Sleep, energy, recovery status...', icon: 'pulse-outline' as const },
  { title: 'Loading Schedule', subtitle: 'Your calendar and upcoming events...', icon: 'calendar-outline' as const },
  { title: 'Almost There', subtitle: 'Finalizing your experience...', icon: 'rocket-outline' as const },
];

export function AppLoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const msg = LOADING_MESSAGES[msgIndex];

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={msg.icon} size={28} color="#00D9FF" />
      </View>
      <Text style={styles.title}>{msg.title}</Text>
      <Text style={styles.subtitle}>{msg.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#12141F',
    gap: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(122, 155, 118, 0.1)',
    marginBottom: 4,
  },
  title: {
    fontFamily: Platform.OS === 'web' ? 'Poppins, sans-serif' : undefined,
    fontWeight: '600',
    fontSize: 16,
    color: '#F5F3ED',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Platform.OS === 'web' ? 'Poppins, sans-serif' : undefined,
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(245,243,237,0.5)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
