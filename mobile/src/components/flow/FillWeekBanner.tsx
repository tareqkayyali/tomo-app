/**
 * FillWeekBanner — "Fill My Week" CTA banner
 *
 * Shows when the user's week is mostly empty and patterns exist.
 * One tap auto-fills the week with conflict-free events based on detected patterns.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';

interface FillWeekBannerProps {
  onFillWeek: () => Promise<{ eventsCreated: number; message: string }>;
  onComplete: () => void; // called after fill to refresh
}

export function FillWeekBanner({ onFillWeek, onComplete }: FillWeekBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const res = await onFillWeek();
      setResult({ count: res.eventsCreated, message: res.message });
      if (res.eventsCreated > 0) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        onComplete();
        // Auto-dismiss after 3s
        setTimeout(() => setDismissed(true), 3000);
      }
    } catch {
      setResult({ count: 0, message: 'Could not fill week' });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={styles.resultBanner}>
        <Ionicons
          name={result.count > 0 ? 'checkmark-circle' : 'information-circle'}
          size={18}
          color={result.count > 0 ? colors.readinessGreen : colors.textMuted}
        />
        <Text style={[styles.resultText, result.count > 0 && { color: colors.readinessGreen }]}>
          {result.message}
        </Text>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable onPress={handlePress} disabled={loading}>
      <LinearGradient
        colors={[`${colors.accent1}15`, `${colors.accent2}15`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.left}>
          <Ionicons name="calendar" size={20} color={colors.accent1} />
          <View>
            <Text style={styles.title}>Fill My Week</Text>
            <Text style={styles.subtitle}>Auto-add events from your patterns</Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent1} />
        ) : (
          <View style={styles.goButton}>
            <Ionicons name="sparkles" size={14} color="#FFF" />
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${colors.accent1}25`,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    subtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    goButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.accent1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    resultText: {
      flex: 1,
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}
