/**
 * QuickScheduleMenu — One-tap scheduling popup
 *
 * Long-press the FAB → pick a type → event instantly created
 * at the best available time. Total interaction: <2 seconds.
 */

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, borderRadius, fontFamily, layout } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import {
  suggestBestTimes,
  minutesToTime,
  format12h,
  DEFAULT_CONFIG,
} from '../../services/schedulingEngine';
import type { ScheduleEvent, SchedulingConfig } from '../../services/schedulingEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickScheduleMenuProps {
  visible: boolean;
  onClose: () => void;
  onQuickCreate: (type: string, name: string, startTime: string, endTime: string) => void;
  events: ScheduleEvent[];
  readinessLevel: string | null;
  config?: SchedulingConfig;
  dayOfWeek?: number;
}

interface QuickOption {
  type: string;
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  duration: number; // minutes
  color: string;
}

const QUICK_OPTIONS: QuickOption[] = [
  { type: 'training', name: 'Training', label: 'Training', icon: 'flash', duration: 60, color: '#FF6B35' },
  { type: 'recovery', name: 'Recovery', label: 'Recovery', icon: 'leaf', duration: 30, color: '#2ED573' },
  { type: 'study_block', name: 'Study Block', label: 'Study', icon: 'book', duration: 60, color: '#5B7FFF' },
  { type: 'match', name: 'Match', label: 'Match', icon: 'trophy', duration: 90, color: '#FFD93D' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickScheduleMenu({
  visible,
  onClose,
  onQuickCreate,
  events,
  readinessLevel,
  config = DEFAULT_CONFIG,
  dayOfWeek,
}: QuickScheduleMenuProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleOptionPress = useCallback(
    (option: QuickOption) => {
      const suggestions = suggestBestTimes(
        option.type,
        option.duration,
        events,
        readinessLevel,
        config,
        dayOfWeek,
        1,
      );

      if (suggestions.length === 0) {
        // No room — close and let caller handle
        onClose();
        return;
      }

      const best = suggestions[0];
      const startTime = minutesToTime(best.startMin);
      const endTime = minutesToTime(best.endMin);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onQuickCreate(option.type, option.name, startTime, endTime);
      onClose();
    },
    [events, readinessLevel, config, dayOfWeek, onQuickCreate, onClose],
  );

  // Pre-compute preview time for each option
  const previews = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const opt of QUICK_OPTIONS) {
      const sugg = suggestBestTimes(opt.type, opt.duration, events, readinessLevel, config, dayOfWeek, 1);
      map[opt.type] = sugg.length > 0 ? format12h(minutesToTime(sugg[0].startMin)) : null;
    }
    return map;
  }, [events, readinessLevel, config, dayOfWeek]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.menuWrap}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>Quick Add</Text>
            <View style={styles.optionsGrid}>
              {QUICK_OPTIONS.map((opt) => {
                const previewTime = previews[opt.type];
                return (
                  <Pressable
                    key={opt.type}
                    onPress={() => handleOptionPress(opt)}
                    disabled={!previewTime}
                    style={({ pressed }) => [
                      styles.optionCard,
                      {
                        opacity: previewTime ? (pressed ? 0.7 : 1) : 0.35,
                      },
                    ]}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: opt.color + '20' }]}>
                      <Ionicons name={opt.icon as any} size={22} color={opt.color} />
                    </View>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionTime}>
                      {previewTime ?? 'No room'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
      paddingBottom: 100,
      paddingRight: layout.screenMargin,
    },
    menuWrap: {
      // Positioned near FAB
    },
    menu: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 20,
      padding: spacing.lg,
      width: 260,
      ...Platform.select({
        web: {
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 12,
        },
      }),
    },
    menuTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'center',
    },
    optionCard: {
      width: 108,
      alignItems: 'center',
      padding: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    optionLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textOnDark,
      marginBottom: 2,
    },
    optionTime: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
  });
}
