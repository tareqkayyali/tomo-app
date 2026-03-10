/**
 * AIHeadsUp — AI contextual advice banner
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, shadows } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { getReadinessMessage } from '../../services/readinessScore';
import type { ReadinessLevel, Archetype } from '../../types';

interface Props {
  readinessLevel: ReadinessLevel;
  archetype?: Archetype | null;
  alerts?: Array<{ type: string; message: string }>;
  onPress?: () => void;
}

export function AIHeadsUp({ readinessLevel, archetype, alerts, onPress }: Props) {
  const { colors } = useTheme();
  const message = getReadinessMessage(readinessLevel, archetype);
  const alertMessage = alerts?.[0]?.message;

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={{ ...styles.card, ...shadows.glowSubtle }}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accent1 + '20' }]}>
            <Ionicons name="sparkles" size={16} color={colors.accent1} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.message, { color: colors.textOnDark }]}>
              {message}
            </Text>
            {alertMessage && (
              <Text style={[styles.alert, { color: colors.textMuted }]} numberOfLines={1}>
                {alertMessage}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.compact,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  message: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  alert: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
});
