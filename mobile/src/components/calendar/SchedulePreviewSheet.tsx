/**
 * SchedulePreviewSheet — Bottom sheet for timeline schedule preview.
 *
 * Used by auto-fill week, drill scheduling, and ghost suggestion flows.
 * Shows proposed events with validation results before confirming.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../hooks/useTheme';

// ── Types (matches backend SchedulePreviewResponse) ──────────────

export interface PreviewEvent {
  title: string;
  event_type: string;
  date: string;
  startTime: string;
  endTime: string;
  intensity?: string;
  notes?: string;
  violations: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  alternatives: Array<{ startTime: string; endTime: string }>;
  accepted: boolean;
}

export interface PreviewData {
  events: PreviewEvent[];
  summary: { total: number; withViolations: number; blocked: number };
  scenario: string;
}

interface SchedulePreviewSheetProps {
  visible: boolean;
  preview: PreviewData | null;
  onConfirm: (events: PreviewEvent[]) => void;
  onDismiss: () => void;
  loading?: boolean;
  title?: string;
}

// ── Component ────────────────────────────────────────────────────

export function SchedulePreviewSheet({
  visible,
  preview,
  onConfirm,
  onDismiss,
  loading = false,
  title = 'Schedule Preview',
}: SchedulePreviewSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Local state for event toggle
  const [events, setEvents] = useState<PreviewEvent[]>([]);

  // Sync when preview changes
  React.useEffect(() => {
    if (preview?.events) {
      setEvents(preview.events.map((e) => ({ ...e })));
    }
  }, [preview]);

  const toggleEvent = useCallback((index: number) => {
    setEvents((prev) =>
      prev.map((e, i) => (i === index ? { ...e, accepted: !e.accepted } : e))
    );
  }, []);

  const moveEvent = useCallback(
    (index: number, alt: { startTime: string; endTime: string }) => {
      setEvents((prev) =>
        prev.map((e, i) =>
          i === index
            ? { ...e, startTime: alt.startTime, endTime: alt.endTime, violations: [], alternatives: [], accepted: true }
            : e
        )
      );
    },
    []
  );

  const acceptedEvents = events.filter((e) => e.accepted);

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, Array<PreviewEvent & { originalIndex: number }>>();
    events.forEach((evt, i) => {
      if (!map.has(evt.date)) map.set(evt.date, []);
      map.get(evt.date)!.push({ ...evt, originalIndex: i });
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const handleConfirm = useCallback(() => {
    onConfirm(acceptedEvents);
  }, [acceptedEvents, onConfirm]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              {preview && (
                <Text style={styles.subtitle}>
                  {acceptedEvents.length} of {events.length} events
                  {preview.summary.withViolations > 0
                    ? ` · ${preview.summary.withViolations} need attention`
                    : ' ready'}
                </Text>
              )}
            </View>
            <Pressable onPress={onDismiss} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textInactive} />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.accent1} size="large" />
                <Text style={styles.loadingText}>Validating schedule...</Text>
              </View>
            ) : (
              byDate.map(([date, dayEvents]) => (
                <View key={date} style={styles.dayGroup}>
                  <Text style={styles.dateLabel}>{date}</Text>
                  {dayEvents.map((evt) => {
                    const hasErrors = evt.violations.some((v) => v.severity === 'error');
                    return (
                      <View
                        key={evt.originalIndex}
                        style={[
                          styles.eventRow,
                          !evt.accepted && styles.eventRowDisabled,
                        ]}
                      >
                        {/* Toggle */}
                        <Pressable
                          onPress={() => toggleEvent(evt.originalIndex)}
                          style={styles.toggleBtn}
                        >
                          <Ionicons
                            name={evt.accepted ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={
                              evt.accepted
                                ? hasErrors
                                  ? '#FBBF24'
                                  : '#4ADE80'
                                : colors.textInactive
                            }
                          />
                        </Pressable>

                        {/* Info */}
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle}>{evt.title}</Text>
                          <Text style={styles.eventTime}>
                            {evt.startTime} – {evt.endTime}
                            {evt.intensity ? ` · ${evt.intensity}` : ''}
                          </Text>

                          {/* Violations */}
                          {evt.violations.map((v, vi) => (
                            <Text
                              key={vi}
                              style={[
                                styles.violationText,
                                {
                                  color: v.severity === 'error' ? '#F87171' : '#FBBF24',
                                },
                              ]}
                            >
                              {v.severity === 'error' ? '🔴' : '🟡'} {v.message}
                            </Text>
                          ))}

                          {/* Alternatives */}
                          {evt.alternatives.length > 0 && (
                            <View style={styles.altsRow}>
                              <Text style={styles.altsLabel}>Try instead:</Text>
                              {evt.alternatives.map((alt, ai) => (
                                <Pressable
                                  key={ai}
                                  style={({ pressed }) => [
                                    styles.altChip,
                                    pressed && { opacity: 0.7 },
                                  ]}
                                  onPress={() => moveEvent(evt.originalIndex, alt)}
                                >
                                  <Text style={styles.altChipText}>
                                    {alt.startTime} – {alt.endTime}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          {!loading && (
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  pressed && { opacity: 0.8 },
                  acceptedEvents.length === 0 && { opacity: 0.4 },
                ]}
                onPress={handleConfirm}
                disabled={acceptedEvents.length === 0}
              >
                <Text style={styles.confirmText}>
                  Confirm {acceptedEvents.length} Event
                  {acceptedEvents.length !== 1 ? 's' : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
      paddingBottom: 34, // safe area
    },
    handleRow: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    subtitle: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
      marginTop: 2,
    },
    closeBtn: {
      padding: 4,
    },
    scrollContent: {
      paddingHorizontal: 20,
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    loadingText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    dayGroup: {
      marginTop: 16,
    },
    dateLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textInactive,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    eventRowDisabled: {
      opacity: 0.4,
    },
    toggleBtn: {
      paddingTop: 2,
    },
    eventInfo: {
      flex: 1,
      gap: 2,
    },
    eventTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },
    eventTime: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    violationText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      marginTop: 2,
    },
    altsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    altsLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textInactive,
    },
    altChip: {
      backgroundColor: 'rgba(74, 222, 128, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(74, 222, 128, 0.2)',
    },
    altChipText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: '#4ADE80',
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    confirmBtn: {
      backgroundColor: colors.accent1,
      borderRadius: borderRadius.full,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmText: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: '#FFFFFF',
    },
  });
}
