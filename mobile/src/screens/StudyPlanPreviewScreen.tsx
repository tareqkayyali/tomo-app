/**
 * StudyPlanPreviewScreen — Preview generated study blocks
 *
 * Shows blocks grouped by date, allows individual removal.
 * "Add to Calendar" creates real calendar events (NOT suggestions).
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { createCalendarEvent } from '../services/api';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type { StudyBlock, CalendarEventInput } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'StudyPlanPreview'>;

export function StudyPlanPreviewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Parse blocks from route params (passed as JSON string)
  const initialBlocks: StudyBlock[] = useMemo(() => {
    try {
      return JSON.parse(route.params.blocks);
    } catch {
      return [];
    }
  }, [route.params.blocks]);

  const [blocks, setBlocks] = useState<StudyBlock[]>(initialBlocks);
  const [saving, setSaving] = useState(false);

  // ── Remove block ───────────────────────────────────────────────────

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // ── Group blocks by date ───────────────────────────────────────────

  const groupedBlocks = useMemo(() => {
    const map = new Map<string, StudyBlock[]>();
    for (const b of blocks) {
      if (!map.has(b.date)) map.set(b.date, []);
      map.get(b.date)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [blocks]);

  // ── Add to Calendar ────────────────────────────────────────────────

  const handleAddToCalendar = useCallback(async () => {
    if (blocks.length === 0) return;

    setSaving(true);
    let successCount = 0;
    const failed: StudyBlock[] = [];

    for (const block of blocks) {
      try {
        const eventData: CalendarEventInput = {
          name: `${block.subject} Study`,
          type: 'study_block',
          date: block.date,
          startTime: block.startTime,
          endTime: block.endTime,
          notes: `For ${block.examType} on ${block.examDate}`,
        };
        await createCalendarEvent(eventData);
        successCount++;
      } catch {
        failed.push(block);
      }
    }

    setSaving(false);

    if (failed.length > 0) {
      setBlocks(failed); // Keep only failed blocks for retry
      Alert.alert(
        'Partial Success',
        `${successCount} blocks added to calendar, ${failed.length} failed. Retry remaining?`,
      );
    } else {
      Alert.alert(
        'Added to Calendar! 📚',
        `${successCount} study blocks added to your calendar. They'll appear in your Day Flow.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  }, [blocks, navigation]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>
          Preview
        </Text>
        <View style={[styles.countBadge, { backgroundColor: colors.accent1 }]}>
          <Text style={styles.countBadgeText}>{blocks.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {groupedBlocks.map(([date, dayBlocks]) => {
          const d = new Date(date + 'T12:00:00');
          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <View key={date} style={styles.dateGroup}>
              <Text style={[styles.dateHeader, { color: colors.textSecondary }]}>{label}</Text>
              {dayBlocks.map((block) => (
                <View key={block.id} style={[styles.blockCard, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.blockSubject, { color: colors.textOnDark }]}>{block.subject}</Text>
                    <Text style={[styles.blockTime, { color: '#6366F1' }]}>
                      📚 {block.startTime} – {block.endTime}
                    </Text>
                    <Text style={[styles.blockMeta, { color: colors.textInactive }]}>
                      for {block.examType} on {block.examDate}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeBlock(block.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={24} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}

        {blocks.length === 0 && (
          <View style={styles.emptyCenter}>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              All blocks removed. Go back to regenerate.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      {blocks.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.addCalBtn, { backgroundColor: '#6366F1', opacity: saving ? 0.6 : 1 }]}
            onPress={handleAddToCalendar}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="calendar" size={18} color="#FFF" />
                <Text style={styles.addCalBtnText}>Add to Calendar ({blocks.length})</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      flex: 1,
    },
    countBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    countBadgeText: {
      color: '#FFF',
      fontSize: 14,
      fontWeight: '700',
    },
    scroll: {
      padding: spacing.lg,
      paddingBottom: 100,
    },
    dateGroup: {
      marginBottom: spacing.md,
    },
    dateHeader: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
    },
    blockCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: 8,
    },
    blockSubject: {
      fontSize: 15,
      fontWeight: '600',
    },
    blockTime: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
    blockMeta: {
      fontSize: 12,
      marginTop: 2,
    },
    emptyCenter: {
      alignItems: 'center',
      paddingTop: 60,
      gap: spacing.md,
    },
    emptySubtitle: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      padding: spacing.md,
      paddingBottom: 34,
    },
    addCalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: borderRadius.md,
    },
    addCalBtnText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
