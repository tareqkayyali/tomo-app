/**
 * WhyPanel
 * Expandable panel showing protocol justifications for a plan.
 * Collapsible "Why this plan?" section with severity-colored dots.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleSheet,
} from 'react-native';
import TomoIcon from '../tomo-ui/TomoIcon';
import { colors, spacing, borderRadius, typography } from '../../theme';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ProtocolJustification {
  name: string;
  severity: string;
  description: string;
  scientific_basis?: string;
}

export interface WhyPanelProps {
  protocols: ProtocolJustification[];
  defaultExpanded?: boolean;
}

const SEVERITY_DOT_COLORS: Record<string, string> = {
  MANDATORY: colors.error,
  ADVISORY: colors.warning,
  INFO: colors.info,
};

function getSeverityDotColor(severity: string): string {
  return SEVERITY_DOT_COLORS[severity.toUpperCase()] ?? colors.textSecondary;
}

export function WhyPanel({ protocols, defaultExpanded = false }: WhyPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!Array.isArray(protocols) || protocols.length === 0) return null;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      {/* Toggle header */}
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
      >
        <Text style={styles.headerText}>Why this plan?</Text>
        <TomoIcon
          name={expanded ? 'Chevron-up' : 'Chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {/* Expandable content */}
      {expanded && (
        <View style={styles.content}>
          {protocols.map((protocol, idx) => (
            <View key={`${protocol.name}-${idx}`} style={styles.protocolRow}>
              {/* Severity dot */}
              <View
                style={[
                  styles.severityDot,
                  { backgroundColor: getSeverityDotColor(protocol.severity) },
                ]}
              />

              {/* Protocol info */}
              <View style={styles.protocolInfo}>
                <Text style={styles.protocolName}>{protocol.name}</Text>
                <Text style={styles.protocolDescription}>
                  {protocol.description}
                </Text>
                {protocol.scientific_basis ? (
                  <Text style={styles.scientificBasis}>
                    {protocol.scientific_basis}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.md,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerText: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Content
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.compact,
  },

  // Protocol row
  protocolRow: {
    flexDirection: 'row',
    gap: spacing.compact,
    alignItems: 'flex-start',
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  protocolInfo: {
    flex: 1,
    gap: 2,
  },
  protocolName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  protocolDescription: {
    ...typography.body,
    color: colors.textBody,
  },
  scientificBasis: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});
