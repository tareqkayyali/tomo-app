/**
 * BulkEditEventsScreen — Select and bulk edit/delete calendar events.
 * Groups linked events (same title+time across days) for batch operations.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { SmartIcon } from '../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../theme';
import { emitRefresh } from '../utils/refreshBus';
import { apiRequest } from '../services/api';

import { colors } from '../theme/colors';

interface CalendarEvent {
  id: string;
  name: string;
  type: string;
  date: string;        // "YYYY-MM-DD"
  startTime: string | null;  // "HH:MM"
  endTime: string | null;    // "HH:MM"
  intensity?: string | null;
}

interface EventGroup {
  key: string;
  title: string;
  eventType: string;
  timeSlot: string;
  events: CalendarEvent[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

const EVENT_BADGES: Record<string, { label: string; color: string }> = {
  training: { label: 'TRAIN', color: colors.accent },
  match: { label: 'MATCH', color: colors.textSecondary },
  recovery: { label: 'RECOVER', color: colors.accentLight },
  study: { label: 'STUDY', color: colors.textSecondary },
  study_block: { label: 'STUDY', color: colors.textSecondary },
  exam: { label: 'EXAM', color: colors.textSecondary },
  school: { label: 'SCHOOL', color: colors.textSecondary },
  sleep: { label: 'SLEEP', color: colors.textSecondary },
  personal: { label: 'PERSONAL', color: colors.textSecondary },
  gym: { label: 'GYM', color: colors.accent },
  club: { label: 'CLUB', color: colors.accent },
  other: { label: 'OTHER', color: colors.textSecondary },
};

// Infer badge from title when event_type is generic (training/other)
const TITLE_BADGE_HINTS: Array<{ pattern: RegExp; badge: string }> = [
  { pattern: /school/i, badge: 'school' },
  { pattern: /sleep/i, badge: 'sleep' },
  { pattern: /gym/i, badge: 'gym' },
  { pattern: /recovery|stretch|foam|cool\s?down/i, badge: 'recovery' },
  { pattern: /match|game|fixture/i, badge: 'match' },
  { pattern: /exam|test|quiz/i, badge: 'exam' },
  { pattern: /study/i, badge: 'study' },
  { pattern: /personal/i, badge: 'personal' },
];

function resolveBadge(eventType: string, title: string): { label: string; color: string } {
  // Direct type match first
  const direct = EVENT_BADGES[eventType];
  if (direct && eventType !== 'training' && eventType !== 'other') return direct;
  // Infer from title for generic types
  for (const hint of TITLE_BADGE_HINTS) {
    if (hint.pattern.test(title)) return EVENT_BADGES[hint.badge];
  }
  return direct ?? EVENT_BADGES.training;
}

export function BulkEditEventsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Fetch 4 weeks of events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      const start = today.toISOString().slice(0, 10);
      const end = new Date(today.getTime() + 28 * 86400000).toISOString().slice(0, 10);
      const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const resp = await apiRequest(`/api/v1/calendar/events?startDate=${start}&endDate=${end}&tz=${tz}`) as Record<string, unknown>;
      const data = (resp?.events as CalendarEvent[]) ?? resp;
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[bulk-edit] Failed to load events', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Group events by title + time pattern
  const eventGroups = useMemo<EventGroup[]>(() => {
    const groups = new Map<string, EventGroup>();

    for (const evt of events) {
      // Group by title only — all "School Hours" together regardless of time
      const key = evt.name;

      if (!groups.has(key)) {
        const timeSlot = evt.startTime
          ? evt.endTime ? `${evt.startTime}–${evt.endTime}` : evt.startTime
          : 'All day';
        groups.set(key, {
          key,
          title: evt.name,
          eventType: evt.type,
          timeSlot,
          events: [],
        });
      }
      groups.get(key)!.events.push(evt);
    }

    // Sort: groups with most events first (recurring patterns)
    return Array.from(groups.values())
      .filter(g => g.events.length > 0)
      .sort((a, b) => b.events.length - a.events.length);
  }, [events]);

  const toggleGroup = useCallback((group: EventGroup) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = group.events.every(e => next.has(e.id));
      if (allSelected) {
        group.events.forEach(e => next.delete(e.id));
      } else {
        group.events.forEach(e => next.add(e.id));
      }
      return next;
    });
  }, []);

  const toggleSingle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = events.map(e => e.id);
    setSelectedIds(new Set(allIds));
  }, [events]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const doDelete = async () => {
      setDeleting(true);
      try {
        const promises = Array.from(selectedIds).map(id =>
          apiRequest(`/api/v1/calendar/events/${id}`, { method: 'DELETE' }).catch(() => null)
        );
        await Promise.allSettled(promises);
        setSelectedIds(new Set());
        fetchEvents();
        emitRefresh('calendar');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Delete failed';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${selectedIds.size} event${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Events',
        `Delete ${selectedIds.size} event${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [selectedIds, fetchEvents]);

  return (
    <PlayerScreen
      label="CALENDAR"
      title="Bulk edit"
      onBack={() => navigation.goBack()}
      right={
        selectedIds.size > 0 ? (
          <Pressable onPress={deselectAll}>
            <Text style={[styles.headerAction, { color: colors.textInactive }]}>Clear</Text>
          </Pressable>
        ) : (
          <Pressable onPress={selectAll}>
            <Text style={[styles.headerAction, { color: colors.accent1 }]}>Select All</Text>
          </Pressable>
        )
      }
      scroll={false}
    >
      {/* Selection count bar */}
      {selectedIds.size > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.backgroundElevated }]}>
          <Text style={[styles.selectionText, { color: colors.textPrimary }]}>
            {selectedIds.size} event{selectedIds.size > 1 ? 's' : ''} selected
          </Text>
          <Pressable
            onPress={handleBulkDelete}
            disabled={deleting}
            style={[styles.deleteButton, deleting && { opacity: 0.5 }]}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <>
                <SmartIcon name="trash-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* Event groups */}
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {eventGroups.map((group) => {
          const allSelected = group.events.every(e => selectedIds.has(e.id));
          const someSelected = group.events.some(e => selectedIds.has(e.id));
          const badge = resolveBadge(group.eventType, group.title);

          return (
            <View key={group.key} style={[styles.groupCard, { backgroundColor: colors.backgroundElevated }]}>
              {/* Group header — tap to select/deselect all in group */}
              <Pressable style={styles.groupHeader} onPress={() => toggleGroup(group)}>
                <View style={styles.groupCheckbox}>
                  <SmartIcon
                    name={allSelected ? 'checkbox' : someSelected ? 'remove-circle-outline' : 'square-outline'}
                    size={22}
                    color={allSelected ? colors.accent1 : colors.textInactive}
                  />
                </View>
                <View style={styles.groupInfo}>
                  <View style={styles.groupTitleRow}>
                    <Text style={[styles.groupTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {group.title}
                    </Text>
                    <View style={[styles.badge, { borderColor: badge.color }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.groupMeta, { color: colors.textInactive }]}>
                    {group.timeSlot} · {group.events.length} occurrence{group.events.length > 1 ? 's' : ''}
                  </Text>
                </View>
              </Pressable>

              {/* Individual events */}
              {group.events.length > 1 && (
                <View style={styles.eventList}>
                  {group.events.map((evt) => {
                    const isSelected = selectedIds.has(evt.id);
                    return (
                      <Pressable key={evt.id} style={styles.eventRow} onPress={() => toggleSingle(evt.id)}>
                        <SmartIcon
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={isSelected ? colors.accent1 : colors.textInactive}
                        />
                        <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                          {formatDate(evt.date)}
                          {evt.startTime ? `  ${evt.startTime}${evt.endTime ? '–' + evt.endTime : ''}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {loading && (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={colors.accent1} />
          </View>
        )}
        {!loading && eventGroups.length === 0 && (
          <View style={styles.empty}>
            <SmartIcon name="calendar-outline" size={48} color={colors.textInactive} />
            <Text style={[styles.emptyText, { color: colors.textInactive }]}>No events to edit</Text>
          </View>
        )}
      </ScrollView>
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    flex: 1,
  },
  headerActions: {},
  headerAction: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  selectionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.textSecondary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
  },
  deleteButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  groupCard: {
    borderRadius: borderRadius.md,
    padding: 12,
    gap: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupCheckbox: {},
  groupInfo: { flex: 1, gap: 2 },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  groupMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  eventList: {
    paddingLeft: 32,
    gap: 6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDate: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
  },
});
