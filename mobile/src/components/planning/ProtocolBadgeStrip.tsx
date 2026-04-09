/**
 * ProtocolBadgeStrip
 * Horizontal scrollable strip of protocol severity badges.
 * MANDATORY = red, ADVISORY = amber, INFO = blue-gray.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

type ProtocolSeverity = 'MANDATORY' | 'ADVISORY' | 'INFO';

interface Protocol {
  id: string;
  name: string;
  severity: ProtocolSeverity;
}

export interface ProtocolBadgeStripProps {
  protocols: Protocol[];
  onPress?: (protocolId: string) => void;
}

const SEVERITY_COLORS: Record<ProtocolSeverity, { bg: string; text: string }> = {
  MANDATORY: {
    bg: 'rgba(231,76,60,0.15)',
    text: colors.error,
  },
  ADVISORY: {
    bg: 'rgba(243,156,18,0.15)',
    text: colors.warning,
  },
  INFO: {
    bg: colors.secondarySubtle,
    text: colors.textSecondary,
  },
};

export function ProtocolBadgeStrip({ protocols, onPress }: ProtocolBadgeStripProps) {
  if (!Array.isArray(protocols) || protocols.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {protocols.map((protocol) => {
        const severityConfig = SEVERITY_COLORS[protocol.severity] ?? SEVERITY_COLORS.INFO;

        const badge = (
          <View
            key={protocol.id}
            style={[styles.badge, { backgroundColor: severityConfig.bg }]}
          >
            <Text
              style={[styles.badgeText, { color: severityConfig.text }]}
              numberOfLines={1}
            >
              {protocol.name}
            </Text>
          </View>
        );

        if (onPress) {
          return (
            <Pressable
              key={protocol.id}
              onPress={() => onPress(protocol.id)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <View style={[styles.badge, { backgroundColor: severityConfig.bg }]}>
                <Text
                  style={[styles.badgeText, { color: severityConfig.text }]}
                  numberOfLines={1}
                >
                  {protocol.name}
                </Text>
              </View>
            </Pressable>
          );
        }

        return badge;
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.compact,
    borderRadius: borderRadius.sm,
    maxWidth: 180,
  },
  badgeText: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
