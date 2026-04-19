/**
 * ChatActionPills — 4-pill tray rendered in the AI Chat empty state.
 *
 * Reads `chat_pills` config from the CMS ConfigProvider. Resolves the 4 pill
 * IDs to display based on `emptyState.mode`:
 *   - "fixed":   uses `emptyState.fixedIds` directly.
 *   - "dynamic": calls GET /api/v1/chat/pills/most-used once on mount,
 *                which returns top-4 most-tapped pills (padded from
 *                defaultFallbackIds). If that call fails we fall back to
 *                the config's fallback list so the UI never empties.
 *
 * On tap: fires `onPress(pill.message)` AND fire-and-forget
 * POST /api/v1/chat/pills/track so Dynamic mode has ranking data.
 *
 * See docs/CHAT_PILLS_RFC.md §4.2.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useConfig } from '../../hooks/useConfigProvider';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { ChatPill, ChatPillsConfig } from '../../services/configService';
import { apiRequest } from '../../services/api';

interface Props {
  onPress: (message: string) => void;
}

const TARGET = 4;

function pillsById(lib: ChatPill[]): Map<string, ChatPill> {
  return new Map(lib.map((p) => [p.id, p]));
}

/**
 * Turn a list of IDs into resolved pill objects, filtering to eligible,
 * deduping, and padding from fallback — all without ever returning more
 * than TARGET or fewer than the library can support.
 */
function resolvePills(
  ids: string[],
  fallbackIds: string[],
  library: ChatPill[],
): ChatPill[] {
  const byId = pillsById(library);
  const eligible = (id: string): ChatPill | null => {
    const p = byId.get(id);
    return p && p.enabled && p.allowInEmptyState ? p : null;
  };

  const out: ChatPill[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (out.length >= TARGET || seen.has(id)) return;
    const p = eligible(id);
    if (!p) return;
    seen.add(id);
    out.push(p);
  };
  ids.forEach(push);
  fallbackIds.forEach(push);
  // Last resort: first N enabled library entries in library order
  for (const p of library) {
    if (p.enabled && p.allowInEmptyState) push(p.id);
  }
  return out.slice(0, TARGET);
}

export const ChatActionPills = React.memo(function ChatActionPills({ onPress }: Props) {
  const { colors } = useTheme();
  const { config } = useConfig();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const chatPills: ChatPillsConfig | null = config?.chat_pills ?? null;
  const mode = chatPills?.emptyState.mode ?? 'fixed';

  const [dynamicIds, setDynamicIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!chatPills || mode !== 'dynamic') return;
    let alive = true;
    apiRequest<{ pillIds: string[] }>('/api/v1/chat/pills/most-used')
      .then((res) => {
        if (alive && Array.isArray(res.pillIds)) setDynamicIds(res.pillIds);
      })
      .catch(() => {
        // Swallow — resolvePills will pad from fallback below
      });
    return () => {
      alive = false;
    };
  }, [chatPills, mode]);

  const pills = useMemo<ChatPill[]>(() => {
    if (!chatPills) return [];
    const chosenIds =
      mode === 'dynamic'
        ? dynamicIds ?? chatPills.emptyState.defaultFallbackIds
        : chatPills.emptyState.fixedIds;
    return resolvePills(
      chosenIds,
      chatPills.emptyState.defaultFallbackIds,
      chatPills.library,
    );
  }, [chatPills, mode, dynamicIds]);

  const handleTap = (pill: ChatPill) => {
    onPress(pill.message);
    // Fire-and-forget telemetry; don't block UI on it.
    apiRequest('/api/v1/chat/pills/track', {
      method: 'POST',
      body: JSON.stringify({ pillId: pill.id, source: 'empty_state' }),
    }).catch(() => {
      // Swallow — telemetry isn't user-facing
    });
  };

  if (pills.length === 0) return null;

  return (
    <View style={styles.row}>
      {pills.map((pill) => (
        <Pressable
          key={pill.id}
          onPress={() => handleTap(pill)}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {pill.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      gap: 6,
    },
    pill: {
      flex: 1,
      backgroundColor: colors.accentSubtle,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillPressed: {
      opacity: 0.7,
      backgroundColor: colors.accentSoft,
    },
    pillText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent2,
      textAlign: 'center',
    },
  });
}
