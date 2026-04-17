/**
 * ProtocolBannerSection — Active protocol alert banner.
 *
 * Config:
 *   show_severity: boolean
 *   show_actions: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const SEVERITY_COLORS: Record<string, string> = {
  MANDATORY: '#A05A4A',
  ADVISORY: '#c49a3c',
  INFO: '#5A8A9F',
};

export const ProtocolBannerSection = memo(function ProtocolBannerSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const showSeverity = (config.show_severity as boolean) ?? true;

  const pdContext = (bootData as any).pdContext;
  if (!pdContext || !pdContext.activeProtocols || pdContext.activeProtocols.length === 0) {
    return null;
  }

  // Show the highest-priority (first) active protocol
  const protocol = pdContext.activeProtocols[0];
  const severityColor = SEVERITY_COLORS[protocol.category] ?? SEVERITY_COLORS.INFO;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: severityColor, borderLeftColor: severityColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.chalk }]}>
          {protocol.name}
        </Text>
        {showSeverity && (
          <Text style={[styles.severity, { color: severityColor }]}>
            {protocol.category}
          </Text>
        )}
      </View>
      {protocol.safety_critical && (
        <Text style={[styles.safetyNote, { color: severityColor }]}>
          Safety-critical protocol active
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    flex: 1,
  },
  severity: {
    fontFamily: fontFamily.display,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  safetyNote: {
    fontFamily: fontFamily.note,
    fontSize: 11,
    marginTop: 4,
  },
});
