/**
 * ModeSelector — Mode switcher matching the Dashboard AthleteModeHero layout.
 *
 * Shows the current mode with a colored indicator bar, large colored label,
 * "CURRENT MODE" caption, description, and a row of 4 tappable mode cards
 * (colored dot + label, active card has colored border + tinted background).
 *
 * Fetches CMS-managed modes from /api/v1/content/modes. Visual contract is
 * identical to AthleteModeHero so MyRules and Dashboard stay consistent.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily, borderRadius } from '../../theme';
import { API_BASE_URL } from '../../services/apiConfig';
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

// Fallback colors when CMS mode has no color (mirrors AthleteModeHero).
// Balanced uses the Tomo sphere's highlight shade (tomoSageDim, #9AB896) so
// the "Balanced" label, pill, indicator bar, and bottom banner icon all
// match the shiny sage used in the AI Chat sphere core gradient.
const MODE_FALLBACK_COLORS: Record<string, string> = {
  balanced: '#9AB896',
  league: '#FF6B35',
  study: '#00D9FF',
  rest: '#AF52DE',
};

export function ModeSelector({ currentMode, onModeChange, disabled }: ModeSelectorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/content/modes`);
      if (res.ok) {
        const data = await res.json();
        setModes(data.modes ?? []);
      }
    } catch {
      // Modes endpoint failure is non-critical
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

  const activeMode = useMemo(
    () => modes.find((m) => m.id === currentMode) ?? null,
    [modes, currentMode],
  );

  // For 'balanced' we always force the Tomo sphere shine (tomoSageDim) —
  // ignoring any CMS override — because the brand rule is that Balanced
  // IS the canonical Tomo color. Other modes honour the CMS color first.
  const modeColor =
    currentMode === 'balanced'
      ? MODE_FALLBACK_COLORS.balanced
      : activeMode?.color ?? MODE_FALLBACK_COLORS[currentMode] ?? colors.accent;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.textInactive} />
      </View>
    );
  }

  if (modes.length === 0) return null;

  const activeLabel =
    activeMode?.label ?? currentMode.charAt(0).toUpperCase() + currentMode.slice(1);

  return (
    <View style={styles.container}>
      {/* Current mode display */}
      <View style={styles.modeDisplay}>
        <View style={[styles.modeIndicator, { backgroundColor: modeColor }]} />
        <View style={styles.modeInfo}>
          <Text style={[styles.modeLabel, { color: modeColor }]}>{activeLabel}</Text>
          <Text style={[styles.modeSubtitle, { color: colors.textSecondary }]}>
            Current Mode
          </Text>
        </View>
      </View>

      {/* Mode description */}
      {activeMode?.description && (
        <Text style={[styles.modeDescription, { color: `${modeColor}B3` }]}>
          {activeMode.description}
        </Text>
      )}

      {/* Mode cards row */}
      <View style={styles.modeCards}>
        {modes.map((mode) => {
          const isActive = mode.id === currentMode;
          // Same rule as modeColor above — Balanced is always the Tomo sage
          // shine, regardless of CMS color overrides, to keep the pill dot +
          // border consistent with the big label.
          const cardColor =
            mode.id === 'balanced'
              ? MODE_FALLBACK_COLORS.balanced
              : mode.color ?? MODE_FALLBACK_COLORS[mode.id] ?? colors.accent;

          return (
            <TouchableOpacity
              key={mode.id}
              onPress={() => handleSelect(mode.id)}
              disabled={disabled || isActive}
              activeOpacity={0.7}
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.chipBackground,
                  borderColor: colors.glassBorder,
                },
                isActive && {
                  borderColor: cardColor,
                  backgroundColor: `${cardColor}15`,
                },
              ]}
            >
              <View
                style={[
                  styles.cardDot,
                  { backgroundColor: isActive ? cardColor : `${cardColor}60` },
                ]}
              />
              <Text
                style={[
                  styles.cardLabel,
                  { color: colors.textSecondary },
                  isActive && { color: cardColor, fontFamily: fontFamily.semiBold },
                ]}
                numberOfLines={1}
              >
                {mode.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingTop: 2,
      paddingBottom: 4,
    },
    loadingContainer: {
      height: 120,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modeDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    modeIndicator: {
      width: 4,
      height: 36,
      borderRadius: 2,
    },
    modeInfo: {
      flex: 1,
    },
    modeLabel: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      letterSpacing: -0.5,
    },
    modeSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 1,
    },
    modeDescription: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 14,
      marginLeft: 16,
    },
    modeCards: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    modeCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
    },
    cardDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    cardLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
  });
}
