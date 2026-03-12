/**
 * Parent Study Plan Screen (Prototype)
 * Daily timeline showing occupied and available time slots.
 * Tapping an available slot navigates to ParentAddStudy with pre-filled time.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../../hooks/useTheme';
import { getParentChildren } from '../../services/api';
import { layout, spacing, borderRadius } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'StudyPlan'>,
  NativeStackScreenProps<ParentStackParamList>
>;

// ── Constants ───────────────────────────────────────────────────────

const TIMELINE_START = 7; // 7 AM
const TIMELINE_END = 22; // 10 PM
const HOUR_HEIGHT = 60;

interface TimeBlock {
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  type: 'occupied' | 'available';
}

// Mock occupied blocks (prototype data)
const MOCK_OCCUPIED: TimeBlock[] = [
  { label: 'School', startHour: 8, startMin: 0, endHour: 15, endMin: 0, type: 'occupied' },
  { label: 'Training', startHour: 16, startMin: 0, endHour: 17, endMin: 30, type: 'occupied' },
];

function getAvailableSlots(occupied: TimeBlock[]): TimeBlock[] {
  const sorted = [...occupied].sort((a, b) => a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin));
  const available: TimeBlock[] = [];
  let currentMin = TIMELINE_START * 60;

  for (const block of sorted) {
    const blockStart = block.startHour * 60 + block.startMin;
    if (blockStart > currentMin) {
      available.push({
        label: 'Available',
        startHour: Math.floor(currentMin / 60),
        startMin: currentMin % 60,
        endHour: block.startHour,
        endMin: block.startMin,
        type: 'available',
      });
    }
    const blockEnd = block.endHour * 60 + block.endMin;
    currentMin = Math.max(currentMin, blockEnd);
  }

  if (currentMin < TIMELINE_END * 60) {
    available.push({
      label: 'Available',
      startHour: Math.floor(currentMin / 60),
      startMin: currentMin % 60,
      endHour: TIMELINE_END,
      endMin: 0,
      type: 'available',
    });
  }

  return available;
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────

export function ParentStudyPlanScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Day selector: today + next 6 days
  const days = useMemo(() => {
    const result: Date[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  const [selectedDay, setSelectedDay] = useState(days[0]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildren(res.children);
        if (res.children.length > 0) setSelectedChild(res.children[0]);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allBlocks = useMemo(() => {
    const available = getAvailableSlots(MOCK_OCCUPIED);
    return [...MOCK_OCCUPIED, ...available].sort(
      (a, b) => a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin),
    );
  }, []);

  const handleSlotPress = useCallback(
    (block: TimeBlock) => {
      if (block.type !== 'available' || !selectedChild) return;
      navigation.navigate('ParentAddStudy', {
        childId: selectedChild.id,
        childName: selectedChild.name,
      });
    },
    [selectedChild, navigation],
  );

  const dayLabel = (d: Date, idx: number): string => {
    if (idx === 0) return 'Today';
    if (idx === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const dayDate = (d: Date): string => d.getDate().toString();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.textOnDark }]}>
          Study Plan {selectedChild ? `- ${selectedChild.name}` : ''}
        </Text>

        {/* Day selector chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.daySelector}
          contentContainerStyle={styles.daySelectorContent}
        >
          {days.map((d, idx) => {
            const isSelected =
              d.toDateString() === selectedDay.toDateString();
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: isSelected ? colors.accent1 : colors.surface,
                    borderColor: isSelected ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => setSelectedDay(d)}
              >
                <Text
                  style={[
                    styles.dayChipLabel,
                    { color: isSelected ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {dayLabel(d, idx)}
                </Text>
                <Text
                  style={[
                    styles.dayChipDate,
                    { color: isSelected ? '#FFFFFF' : colors.textOnDark },
                  ]}
                >
                  {dayDate(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Prototype badge */}
        <View style={[styles.protoBadge, { backgroundColor: colors.surface }]}>
          <Ionicons name="flask-outline" size={16} color={colors.accent1} />
          <Text style={[styles.protoText, { color: colors.textSecondary }]}>
            Prototype view - will be fully data-driven later
          </Text>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          {allBlocks.map((block, idx) => {
            const durationMin =
              (block.endHour * 60 + block.endMin) -
              (block.startHour * 60 + block.startMin);
            const height = (durationMin / 60) * HOUR_HEIGHT;
            const isAvailable = block.type === 'available';

            return (
              <TouchableOpacity
                key={idx}
                disabled={!isAvailable}
                onPress={() => handleSlotPress(block)}
                style={[
                  styles.timeBlock,
                  {
                    height,
                    backgroundColor: isAvailable ? 'transparent' : colors.surface,
                    borderColor: isAvailable ? '#2ED573' : colors.border,
                    borderStyle: isAvailable ? 'dashed' : 'solid',
                    borderWidth: isAvailable ? 1.5 : 1,
                    opacity: isAvailable ? 1 : 0.6,
                  },
                ]}
              >
                <View style={styles.timeBlockHeader}>
                  <Text style={[styles.timeBlockLabel, { color: isAvailable ? '#2ED573' : colors.textSecondary }]}>
                    {block.label}
                  </Text>
                  <Text style={[styles.timeBlockTime, { color: colors.textSecondary }]}>
                    {formatTime(block.startHour, block.startMin)} - {formatTime(block.endHour, block.endMin)}
                  </Text>
                </View>
                {isAvailable && (
                  <View style={styles.addHint}>
                    <Ionicons name="add-circle-outline" size={20} color="#2ED573" />
                    <Text style={{ color: '#2ED573', fontSize: 12, marginLeft: 4 }}>
                      Tap to add study block
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Quick actions */}
        {selectedChild && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: colors.accent1 }]}
              onPress={() =>
                navigation.navigate('ParentAddStudy', {
                  childId: selectedChild.id,
                  childName: selectedChild.name,
                })
              }
            >
              <Ionicons name="book-outline" size={18} color="#FFFFFF" />
              <Text style={styles.quickButtonText}>Add Study Block</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: '#FF4757' }]}
              onPress={() =>
                navigation.navigate('ParentAddExam', {
                  childId: selectedChild.id,
                  childName: selectedChild.name,
                })
              }
            >
              <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
              <Text style={styles.quickButtonText}>Add Exam</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.md,
  },

  // Day selector
  daySelector: {
    marginBottom: spacing.md,
  },
  daySelectorContent: {
    gap: spacing.sm,
  },
  dayChip: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minWidth: 64,
  },
  dayChipLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  dayChipDate: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },

  // Proto badge
  protoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    gap: 6,
  },
  protoText: {
    fontSize: 12,
  },

  // Timeline
  timeline: {
    gap: spacing.sm,
  },
  timeBlock: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  timeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeBlockLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeBlockTime: {
    fontSize: 12,
  },
  addHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  quickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  quickButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
