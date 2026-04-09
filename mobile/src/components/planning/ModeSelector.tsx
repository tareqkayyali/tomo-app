/**
 * ModeSelector — Horizontal card row for athlete mode switching.
 *
 * Displays CMS-managed modes (Balanced/League/Study/Rest) as tappable cards.
 * Fetches available modes from /api/v1/content/modes.
 * Selected mode shown with colored border + filled background.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily, spacing, borderRadius } from '../../theme';
import { getApiUrl } from '../../services/apiConfig';
import type { ThemeColors } from '../../theme/colors';

interface ModeDefinition {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  params: Record<string, unknown>;
}

interface ModeSelectorProps {
  currentMode: string;
  onModeChange: (modeId: string) => void;
  disabled?: boolean;
}

export function ModeSelector({ currentMode, onModeChange, disabled }: ModeSelectorProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModes = useCallback(async () => {
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/v1/content/modes`);
      if (res.ok) {
        const data = await res.json();
        setModes(data.modes ?? []);
      }
    } catch {
      // Silently fail — modes not critical for page load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModes();
  }, [fetchModes]);

  const handleSelect = useCallback(
    (modeId: string) => {
      if (disabled || modeId === currentMode) return;
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onModeChange(modeId);
    },
    [currentMode, onModeChange, disabled],
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.textInactive} />
      </View>
    );
  }

  if (modes.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Athlete Mode</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
      >
        {modes.map((mode) => {
          const isActive = mode.id === currentMode;
          const modeColor = mode.color ?? colors.accent1;

          return (
            <TouchableOpacity
              key={mode.id}
              onPress={() => handleSelect(mode.id)}
              disabled={disabled}
              activeOpacity={0.7}
              style={[
                styles.card,
                isActive && {
                  borderColor: modeColor,
                  backgroundColor: `${modeColor}15`,
                },
              ]}
            >
              <Text
                style={[
                  styles.cardLabel,
                  isActive && { color: modeColor, fontFamily: fontFamily.bold },
                ]}
              >
                {mode.label}
              </Text>
              {isActive && (
                <View style={[styles.activeDot, { backgroundColor: modeColor }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {modes.find((m) => m.id === currentMode)?.description && (
        <Text style={styles.modeDescription}>
          {modes.find((m) => m.id === currentMode)?.description}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    loadingContainer: {
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionLabel: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
      color: colors.textInactive,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.sm,
    },
    cardRow: {
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    card: {
      width: 90,
      height: 90,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 2,
      borderColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    cardLabel: {
      fontSize: 12,
      fontFamily: fontFamily.medium,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    activeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      position: 'absolute',
      top: 8,
      right: 8,
    },
    modeDescription: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      color: colors.textInactive,
      marginTop: spacing.xs,
      lineHeight: 16,
    },
  });
}
