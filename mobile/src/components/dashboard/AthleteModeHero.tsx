/**
 * AthleteModeHero — Dashboard hero section showing current athlete mode.
 *
 * Replaces SignalHero as the top-of-dashboard component.
 * Shows the current mode prominently with color accent, description,
 * and a horizontal mode selector for quick switching.
 *
 * On mode change:
 *   1. PATCH /api/v1/schedule/rules with { athlete_mode: newMode }
 *   2. Backend emits MODE_CHANGE event -> updates snapshot + audit trail
 *   3. Calls refreshBoot() to refresh all downstream dashboard data
 *
 * Keeps QuickAccessRow (Program/Metrics/Progress panel pills) for
 * slide-up panel access.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { fontFamily } from '../../theme/typography';
import { QuickAccessRow } from './QuickAccessRow';
import { API_BASE_URL } from '../../services/apiConfig';
import { updateScheduleRules } from '../../services/api';

type PanelId = 'training' | 'metrics' | 'progress' | null;

interface ModeDefinition {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string;
  params: Record<string, unknown>;
}

// Fallback colors when CMS mode has no color
const MODE_FALLBACK_COLORS: Record<string, string> = {
  balanced: '#30D158',
  league: '#FF6B35',
  study: '#00D9FF',
  rest: '#AF52DE',
};

interface AthleteModeHeroProps {
  currentMode: string;
  signal: {
    color: string;
    showUrgencyBadge: boolean;
    urgencyLabel: string | null;
  };
  activePanel: PanelId;
  onPanelPress: (panel: PanelId) => void;
  onModeChanged: () => void; // Triggers boot refresh
}

export function AthleteModeHero({
  currentMode,
  signal,
  activePanel,
  onPanelPress,
  onModeChanged,
}: AthleteModeHeroProps) {
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Optimistic mode — shows the selected mode immediately while the
  // backend PATCH + boot refresh completes. Cleared once bootData confirms.
  const [optimisticMode, setOptimisticMode] = useState<string | null>(null);
  const effectiveMode = optimisticMode ?? currentMode;

  // Clear optimistic override once bootData catches up
  useEffect(() => {
    if (optimisticMode && currentMode === optimisticMode) {
      setOptimisticMode(null);
    }
  }, [currentMode, optimisticMode]);

  // Fetch available modes from CMS
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

  // Current mode definition (uses effective mode = optimistic or confirmed)
  const activeMode = useMemo(() => {
    return modes.find((m) => m.id === effectiveMode) ?? null;
  }, [modes, effectiveMode]);

  const modeColor = activeMode?.color ?? MODE_FALLBACK_COLORS[effectiveMode] ?? '#7a9b76';

  // Handle mode switch — optimistic UI + server persist + boot refresh
  const handleModeChange = useCallback(
    async (newModeId: string) => {
      if (newModeId === effectiveMode || switching) return;
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Instant visual update — no waiting for server round-trip
      setOptimisticMode(newModeId);
      setSwitching(true);
      try {
        // PATCH schedule rules — backend emits MODE_CHANGE event,
        // updates snapshot + audit trail, triggers recommendation recompute
        await updateScheduleRules({ athlete_mode: newModeId });

        // Refresh boot data so the entire dashboard reflects the new mode
        onModeChanged();
      } catch (err) {
        console.warn('[AthleteModeHero] Mode change failed:', err);
        // Revert optimistic update on failure
        setOptimisticMode(null);
      } finally {
        setSwitching(false);
      }
    },
    [effectiveMode, switching, onModeChanged],
  );

  return (
    <View style={styles.container}>
      {/* Quick access pills (Program / Metrics / Progress) + date */}
      <QuickAccessRow
        activePanel={activePanel}
        onPanelPress={onPanelPress}
        signalColor={modeColor}
        showUrgencyBadge={signal.showUrgencyBadge}
        urgencyLabel={signal.urgencyLabel}
      />

      {/* Current mode display */}
      <View style={styles.modeDisplay}>
        <View style={[styles.modeIndicator, { backgroundColor: modeColor }]} />
        <View style={styles.modeInfo}>
          <Text style={[styles.modeLabel, { color: modeColor }]}>
            {activeMode?.label ?? effectiveMode.charAt(0).toUpperCase() + effectiveMode.slice(1)}
          </Text>
          <Text style={styles.modeSubtitle}>Current Mode</Text>
        </View>
      </View>

      {/* Mode description */}
      {activeMode?.description && (
        <Text style={[styles.modeDescription, { color: `${modeColor}B3` }]}>
          {activeMode.description}
        </Text>
      )}

      {/* Mode selector cards */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="rgba(245,243,237,0.3)" />
        </View>
      ) : modes.length > 0 ? (
        <View style={styles.modeCards}>
          {modes.map((mode) => {
            const isActive = mode.id === effectiveMode;
            const cardColor = mode.color ?? MODE_FALLBACK_COLORS[mode.id] ?? '#666';

            return (
              <TouchableOpacity
                key={mode.id}
                onPress={() => handleModeChange(mode.id)}
                disabled={switching || isActive}
                activeOpacity={0.7}
                style={[
                  styles.modeCard,
                  isActive && {
                    borderColor: cardColor,
                    backgroundColor: `${cardColor}15`,
                  },
                ]}
              >
                {/* Color dot */}
                <View
                  style={[
                    styles.cardDot,
                    {
                      backgroundColor: isActive ? cardColor : `${cardColor}60`,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.cardLabel,
                    isActive && { color: cardColor, fontFamily: fontFamily.semiBold },
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Switching indicator */}
      {switching && (
        <View style={styles.switchingRow}>
          <ActivityIndicator size="small" color={modeColor} />
          <Text style={[styles.switchingText, { color: modeColor }]}>
            Updating your mode...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
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
    color: 'rgba(245,243,237,0.35)',
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
    borderRadius: 10,
    backgroundColor: 'rgba(245,243,237,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,243,237,0.06)',
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: 'rgba(245,243,237,0.50)',
  },
  loadingRow: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  switchingText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
});
