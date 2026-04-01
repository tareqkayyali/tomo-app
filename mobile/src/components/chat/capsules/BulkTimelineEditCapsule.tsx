/**
 * BulkTimelineEditCapsule — Inline bulk event selector within chat.
 * Groups events by title+time pattern for batch select/delete.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SmartIcon } from '../../SmartIcon';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { BulkTimelineEditCapsule as BulkTimelineEditType, CapsuleAction } from '../../../types/chat';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

const EVENT_BADGES: Record<string, { label: string; color: string }> = {
  training: { label: 'TRAIN', color: '#FF6B35' },
  match: { label: 'MATCH', color: '#7B61FF' },
  recovery: { label: 'RECOVER', color: '#30D158' },
  study: { label: 'STUDY', color: '#00D9FF' },
  exam: { label: 'EXAM', color: '#F39C12' },
  school: { label: 'SCHOOL', color: '#8E8E93' },
  sleep: { label: 'SLEEP', color: '#5856D6' },
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'training', label: 'Training' },
  { id: 'match', label: 'Match' },
  { id: 'study', label: 'Study' },
  { id: 'exam', label: 'Exam' },
  { id: 'recovery', label: 'Recovery' },
];

interface Props {
  card: BulkTimelineEditType;
  onSubmit: (action: CapsuleAction) => void;
}

export function BulkTimelineEditCapsuleComponent({ card, onSubmit }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  // Filter groups by event type
  const filteredGroups = useMemo(() => {
    if (activeFilter === 'all') return card.groupedEvents;
    return card.groupedEvents.filter(g => g.eventType === activeFilter);
  }, [card.groupedEvents, activeFilter]);

  // Available filter tabs (only show tabs with events)
  const availableFilters = useMemo(() => {
    const types = new Set(card.groupedEvents.map(g => g.eventType));
    return FILTER_TABS.filter(f => f.id === 'all' || types.has(f.id));
  }, [card.groupedEvents]);

  const toggleGroup = useCallback((group: typeof card.groupedEvents[0]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = group.eventIds.every(id => next.has(id));
      if (allSelected) {
        group.eventIds.forEach(id => next.delete(id));
      } else {
        group.eventIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = filteredGroups.flatMap(g => g.eventIds);
    setSelectedIds(new Set(allIds));
  }, [filteredGroups]);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0 || submitting) return;
    setSubmitting(true);
    onSubmit({
      type: 'bulk_timeline_edit_capsule',
      toolName: 'bulk_delete_events',
      toolInput: { eventIds: Array.from(selectedIds) },
      agentType: 'timeline',
    });
  }, [selectedIds, submitting, onSubmit]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📋 Bulk Edit Events</Text>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {availableFilters.map(f => {
          const isActive = f.id === activeFilter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setActiveFilter(f.id)}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Select/Clear header */}
      <View style={styles.selectHeader}>
        <Text style={styles.selectCount}>
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${card.events.length} events`}
        </Text>
        {selectedIds.size > 0 ? (
          <Pressable onPress={deselectAll}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : (
          <Pressable onPress={selectAll}>
            <Text style={styles.selectAllText}>Select All</Text>
          </Pressable>
        )}
      </View>

      {/* Grouped event list */}
      <ScrollView style={styles.scrollArea} nestedScrollEnabled showsVerticalScrollIndicator>
        {filteredGroups.map(group => {
          const allSelected = group.eventIds.every(id => selectedIds.has(id));
          const someSelected = group.eventIds.some(id => selectedIds.has(id));
          const badge = EVENT_BADGES[group.eventType] ?? EVENT_BADGES.training;

          return (
            <Pressable key={group.key} style={styles.groupRow} onPress={() => toggleGroup(group)}>
              <SmartIcon
                name={allSelected ? 'checkbox' : someSelected ? 'remove-circle-outline' : 'square-outline'}
                size={20}
                color={allSelected ? colors.accent1 : colors.textInactive}
              />
              <View style={styles.groupInfo}>
                <Text style={styles.groupTitle} numberOfLines={1}>{group.title}</Text>
                <Text style={styles.groupMeta}>{group.timeSlot} · {group.count}x</Text>
              </View>
              <View style={[styles.badge, { borderColor: badge.color }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </Pressable>
          );
        })}
        {filteredGroups.length === 0 && (
          <Text style={styles.emptyText}>No events in this category</Text>
        )}
      </ScrollView>

      {/* Delete action */}
      {selectedIds.size > 0 && (
        <CapsuleSubmitButton
          title={`Delete ${selectedIds.size} event${selectedIds.size > 1 ? 's' : ''}`}
          onPress={handleDelete}
          disabled={submitting}
          loading={submitting}
          variant="danger"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    padding: 14,
    gap: 10,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  filterRow: {
    gap: 6,
    paddingRight: 8,
  },
  filterTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.chipBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterTabActive: {
    borderColor: colors.accent1,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
  },
  filterTabText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textInactive,
  },
  filterTabTextActive: {
    color: colors.accent1,
  },
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectCount: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  clearText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  selectAllText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.accent1,
  },
  scrollArea: {
    maxHeight: 220,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  groupInfo: {
    flex: 1,
    gap: 1,
  },
  groupTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  groupMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textInactive,
  },
  badge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
