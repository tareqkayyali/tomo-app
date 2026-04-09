/**
 * PlanDiffView
 * Before/after comparison when adjusting a plan.
 * Toggle between Before and After tabs, with changed sessions highlighted.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface DiffSession {
  day: string;
  time: string;
  name: string;
  intensity: string;
}

export interface PlanDiffViewProps {
  before: DiffSession[];
  after: DiffSession[];
}

type DiffTab = 'before' | 'after';

type DiffStatus = 'unchanged' | 'added' | 'removed' | 'changed';

interface AnnotatedSession extends DiffSession {
  status: DiffStatus;
}

/** Create a stable key for matching sessions across before/after */
function sessionKey(s: DiffSession): string {
  return `${s.day}::${s.time}::${s.name}`;
}

/** Compute diff annotations for the active tab */
function computeDiff(
  before: DiffSession[],
  after: DiffSession[],
): { beforeAnnotated: AnnotatedSession[]; afterAnnotated: AnnotatedSession[] } {
  const beforeKeys = new Set(before.map(sessionKey));
  const afterKeys = new Set(after.map(sessionKey));

  // Map after sessions by key for quick field comparison
  const afterMap = new Map<string, DiffSession>();
  for (const s of after) afterMap.set(sessionKey(s), s);

  const beforeMap = new Map<string, DiffSession>();
  for (const s of before) beforeMap.set(sessionKey(s), s);

  const beforeAnnotated: AnnotatedSession[] = before.map((s) => {
    const key = sessionKey(s);
    if (!afterKeys.has(key)) {
      return { ...s, status: 'removed' };
    }
    const counterpart = afterMap.get(key)!;
    if (s.intensity !== counterpart.intensity) {
      return { ...s, status: 'changed' };
    }
    return { ...s, status: 'unchanged' };
  });

  const afterAnnotated: AnnotatedSession[] = after.map((s) => {
    const key = sessionKey(s);
    if (!beforeKeys.has(key)) {
      return { ...s, status: 'added' };
    }
    const counterpart = beforeMap.get(key)!;
    if (s.intensity !== counterpart.intensity) {
      return { ...s, status: 'changed' };
    }
    return { ...s, status: 'unchanged' };
  });

  return { beforeAnnotated, afterAnnotated };
}

const STATUS_BORDER_COLORS: Record<DiffStatus, string | undefined> = {
  unchanged: undefined,
  added: colors.accent,
  removed: colors.error,
  changed: colors.warning,
};

export function PlanDiffView({ before, after }: PlanDiffViewProps) {
  const [activeTab, setActiveTab] = useState<DiffTab>('after');

  const { beforeAnnotated, afterAnnotated } = useMemo(
    () => computeDiff(before, after),
    [before, after],
  );

  const sessions = activeTab === 'before' ? beforeAnnotated : afterAnnotated;

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('before')}
          style={[
            styles.tab,
            activeTab === 'before' && styles.tabActive,
          ]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'before' && styles.tabTextActive,
            ]}
          >
            Before
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('after')}
          style={[
            styles.tab,
            activeTab === 'after' && styles.tabActive,
          ]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'after' && styles.tabTextActive,
            ]}
          >
            After
          </Text>
        </Pressable>
      </View>

      {/* Session list */}
      <View style={styles.sessionList}>
        {sessions.map((session, idx) => {
          const borderColor = STATUS_BORDER_COLORS[session.status];
          const isRemoved = session.status === 'removed';

          return (
            <View
              key={`${session.day}-${session.time}-${idx}`}
              style={[
                styles.sessionRow,
                borderColor
                  ? { borderLeftWidth: 3, borderLeftColor: borderColor }
                  : undefined,
                isRemoved && styles.removedRow,
              ]}
            >
              <View style={styles.sessionLeft}>
                <Text style={styles.sessionDay}>{session.day}</Text>
                <Text style={styles.sessionTime}>{session.time}</Text>
              </View>
              <View style={styles.sessionCenter}>
                <Text
                  style={[
                    styles.sessionName,
                    isRemoved && styles.removedText,
                  ]}
                  numberOfLines={1}
                >
                  {session.name}
                </Text>
              </View>
              <Text
                style={[
                  styles.sessionIntensity,
                  isRemoved && styles.removedText,
                ]}
              >
                {session.intensity}
              </Text>

              {/* Status indicator */}
              {session.status !== 'unchanged' && (
                <View style={styles.statusTag}>
                  <Text
                    style={[
                      styles.statusTagText,
                      {
                        color:
                          session.status === 'added'
                            ? colors.accent
                            : session.status === 'removed'
                            ? colors.error
                            : colors.warning,
                      },
                    ]}
                  >
                    {session.status === 'added'
                      ? 'NEW'
                      : session.status === 'removed'
                      ? 'CUT'
                      : 'MOD'}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },

  // Tab bar (underline style per Tomo pattern)
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.compact,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },

  // Session list
  sessionList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.compact,
    gap: spacing.sm,
  },
  removedRow: {
    opacity: 0.5,
  },
  sessionLeft: {
    width: 56,
  },
  sessionDay: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
  },
  sessionTime: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
  },
  sessionCenter: {
    flex: 1,
  },
  sessionName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  removedText: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  sessionIntensity: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    width: 56,
    textAlign: 'right',
  },

  // Status tag
  statusTag: {
    width: 32,
    alignItems: 'flex-end',
  },
  statusTagText: {
    ...typography.metadataSmall,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
