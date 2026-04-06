/**
 * SuggestionCard — Inline suggestion from coach/parent
 * Shows in the player's Plan tab with accept/decline actions.
 *
 * Types:
 *   - test_result: Coach submitted a test → just accept/decline
 *   - study_block: Parent suggested study time
 *   - exam_date: Parent added an exam
 *   - calendar_event: Generic event suggestion
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';

import { useTheme } from '../hooks/useTheme';
import { resolveSuggestion } from '../services/api';
import { spacing, borderRadius } from '../theme';
import type { Suggestion, SuggestionType } from '../types';

import { colors } from '../theme/colors';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onResolved?: (id: string, status: string) => void;
}

// Type-specific icons and colors
function getTypeMeta(colors: { accent: string; error: string; info: string; warning: string }) {
  return {
    test_result: { icon: 'flash-outline' as keyof typeof Ionicons.glyphMap, label: 'Test Result', accentColor: colors.accent },
    study_block: { icon: 'book-outline' as keyof typeof Ionicons.glyphMap, label: 'Study Block', accentColor: colors.info },
    exam_date: { icon: 'school-outline' as keyof typeof Ionicons.glyphMap, label: 'Exam Date', accentColor: colors.error },
    calendar_event: { icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap, label: 'Event', accentColor: colors.accent },
  };
}

function formatPayload(type: SuggestionType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'test_result': {
      const vals = payload.values as Record<string, unknown> | undefined;
      if (vals) return `${payload.testType}: ${vals.primaryValue} ${vals.unit}`;
      return String(payload.testType || '');
    }
    case 'study_block': {
      const start = payload.startAt ? new Date(payload.startAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const end = payload.endAt ? new Date(payload.endAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `${payload.subject || 'Study'}${start ? ` · ${start}–${end}` : ''}`;
    }
    case 'exam_date': {
      const date = payload.examDate ? new Date(payload.examDate as string).toLocaleDateString() : '';
      return `${payload.subject || 'Exam'} ${payload.examType ? `(${payload.examType})` : ''} ${date ? `· ${date}` : ''}`.trim();
    }
    default:
      return payload.notes ? String(payload.notes) : '';
  }
}

export function SuggestionCard({ suggestion, onResolved }: SuggestionCardProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState<'accepted' | 'declined' | null>(null);

  const typeMeta = getTypeMeta(colors);
  const meta = typeMeta[suggestion.suggestion_type] || typeMeta.calendar_event;

  const handleAction = async (status: 'accepted' | 'declined') => {
    setLoading(status);
    try {
      await resolveSuggestion(suggestion.id, { status });
      onResolved?.(suggestion.id, status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(null);
    }
  };

  const detail = formatPayload(suggestion.suggestion_type, suggestion.payload);
  const authorLabel = suggestion.authorName
    ? `From ${suggestion.authorName}`
    : `From your ${suggestion.author_role}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderLeftColor: meta.accentColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: meta.accentColor + '22' }]}>
          <SmartIcon name={meta.icon} size={18} color={meta.accentColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.typeLabel, { color: meta.accentColor }]}>{meta.label}</Text>
          <Text style={[styles.author, { color: colors.textSecondary }]}>{authorLabel}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: colors.textOnDark }]} numberOfLines={2}>
        {suggestion.title}
      </Text>

      {/* Detail line */}
      {detail ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => handleAction('accepted')}
          disabled={!!loading}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.acceptBtn,
            { backgroundColor: colors.accent, opacity: pressed || loading === 'accepted' ? 0.7 : 1 },
          ]}
        >
          {loading === 'accepted' ? (
            <ActivityIndicator size="small" color="#F5F3ED" />
          ) : (
            <>
              <SmartIcon name="checkmark" size={16} color="#F5F3ED" />
              <Text style={styles.actionText}>Accept</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => handleAction('declined')}
          disabled={!!loading}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.declineBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed || loading === 'declined' ? 0.7 : 1 },
          ]}
        >
          {loading === 'declined' ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <>
              <SmartIcon name="close" size={16} color={colors.textSecondary} />
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Decline</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderLeftWidth: 3,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  author: {
    fontSize: 12,
    marginTop: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  detail: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  acceptBtn: {},
  declineBtn: {
    borderWidth: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
