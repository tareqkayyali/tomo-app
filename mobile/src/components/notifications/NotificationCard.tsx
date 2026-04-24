/**
 * NotificationCard — Polished notification card matching RecCard visual quality.
 *
 * Key fixes vs previous version:
 * - Cards use elevated bg with category tint for visibility (not invisible GlassCard)
 * - P1/P2 start EXPANDED by default (user sees body, chips, actions immediately)
 * - P3 shows body preview (1 line) even when collapsed
 * - Action buttons have solid colored backgrounds (not transparent)
 * - Prominent unread indicator (colored left border + dot)
 * - GlowWrapper breathing on P1 critical
 * - Category badge on all priority tiers (matches filter bar counts)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../SmartIcon';
import { AskTomoChip } from '../mastery/AskTomoChip';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { GlowWrapper } from '../GlowWrapper';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { colors } from '../../theme/colors';

import {
  CATEGORY_CONFIG,
  getChipColor,
  getAnimationDelay,
  type NotificationCategory,
  type CategoryConfig,
} from './constants';

// ─── Types ────────────────────────────────────────────────────────────

interface Chip {
  label: string;
  style: string;
}

interface Action {
  label: string;
  deep_link: string;
  resolves?: boolean;
  dismisses?: boolean;
}

export interface NotificationData {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: number;
  title: string;
  body: string;
  chips: Chip[];
  primary_action: Action | null;
  secondary_action: Action | null;
  status: 'unread' | 'read' | 'acted' | 'dismissed' | 'expired';
  created_at: string;
  expires_at: string | null;
}

interface NotificationCardProps {
  notification: NotificationData;
  index: number;
  onPrimaryAction: (n: NotificationData) => void;
  onSecondaryAction: (n: NotificationData) => void;
  onDismiss: (n: NotificationData) => void;
  onPress: (n: NotificationData) => void;
}

// CATEGORY_CONFIG, getChipColor, getAnimationDelay imported from ./constants

// ─── Helpers ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Card Shell (replaces GlassCard with visible elevated card) ──────

function CardShell({
  children,
  config,
  isUnread,
  isDone,
  style,
}: {
  children: React.ReactNode;
  config: CategoryConfig;
  isUnread: boolean;
  isDone: boolean;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          borderWidth: 1,
          borderColor: isUnread ? config.color + '40' : colors.creamSubtle,
          borderLeftWidth: isUnread ? 3 : 1,
          borderLeftColor: isUnread ? config.color : colors.creamSubtle,
          padding: spacing.lg,
          position: 'relative' as const,
        },
        isDone && { opacity: 0.5 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export function NotificationCard({
  notification: n,
  index,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
  onPress,
}: NotificationCardProps) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  // All notifications start collapsed — user taps to expand
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[n.category];
  const isUnread = n.status === 'unread';
  const isDone = n.status === 'acted' || n.status === 'dismissed';
  const s = useMemo(() => createStyles(colors), [colors]);

  // ── P1: Critical Hero Card with Glow ──
  if (n.priority === 1) {
    return (
      <Animated.View entering={FadeInDown.delay(getAnimationDelay(index)).duration(350).springify()}>
        <GlowWrapper glow={config.glow} breathing style={{ marginBottom: spacing.md, marginHorizontal: spacing.lg }}>
          <CardShell config={config} isUnread={isUnread} isDone={isDone}
            style={{ backgroundColor: colors.surface, borderColor: config.color + '60' }}>
            {/* Header: icon + badge + time + priority */}
            <View style={s.topRow}>
              <View style={s.typeRow}>
                <View style={[s.iconCircleLg, { backgroundColor: config.color + '25' }]}>
                  <SmartIcon name={config.icon} size={18} color={config.color} />
                </View>
                <Badge label={config.label} variant={config.badgeVariant} size="small" />
              </View>
              <View style={s.typeRow}>
                <Text style={[s.timeText, { color: colors.textSecondary }]}>{timeAgo(n.created_at)}</Text>
                <Badge label="URGENT" variant="error" size="small" />
              </View>
            </View>

            {/* Title */}
            <Pressable
              onPress={() => { setExpanded(!expanded); onPress(n); }}
              hitSlop={8}
              style={s.titleRow}
            >
              <Text style={s.titleP1}>{n.title}</Text>
              <SmartIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>

            {/* Always-visible body */}
            <Text style={s.body}>{n.body}</Text>

            {/* Expanded: chips + actions */}
            {expanded && (
              <>
                <ChipRow chips={n.chips} />
                <AskTomoButton n={n} colors={colors} s={s} navigation={navigation} />
              </>
            )}

            {isUnread && <View style={[s.unreadDot, { backgroundColor: config.color }]} />}
          </CardShell>
        </GlowWrapper>
      </Animated.View>
    );
  }

  // ── P2: Today Card (expanded by default) ──
  if (n.priority === 2) {
    return (
      <Animated.View entering={FadeInDown.delay(getAnimationDelay(index)).duration(350).springify()}>
        <CardShell config={config} isUnread={isUnread} isDone={isDone}
          style={{ marginBottom: spacing.sm, marginHorizontal: spacing.lg }}>
          {/* Header */}
          <Pressable onPress={() => { setExpanded(!expanded); onPress(n); }} hitSlop={8} style={s.topRow}>
            <View style={[s.typeRow, { flex: 1 }]}>
              <View style={[s.iconCircle, { backgroundColor: config.color + '25' }]}>
                <SmartIcon name={config.icon} size={15} color={config.color} />
              </View>
              <Badge label={config.label} variant={config.badgeVariant} size="small" />
              <Text style={[s.timeText, { color: colors.textSecondary, marginLeft: 'auto' }]}>{timeAgo(n.created_at)}</Text>
            </View>
            <SmartIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </Pressable>

          {/* Title always visible */}
          <Text style={s.titleP2}>{n.title}</Text>

          {/* Body always visible */}
          <Text style={s.body}>{n.body}</Text>

          {/* Expanded: chips + actions */}
          {expanded && (
            <>
              <ChipRow chips={n.chips} />
              <AskTomoButton n={n} colors={colors} s={s} navigation={navigation} />
            </>
          )}

          {isUnread && <View style={[s.unreadDot, { backgroundColor: config.color }]} />}
        </CardShell>
      </Animated.View>
    );
  }

  // ── P3: This Week Card ──
  if (n.priority === 3) {
    return (
      <Animated.View entering={FadeInDown.delay(getAnimationDelay(index)).duration(350).springify()}>
        <CardShell config={config} isUnread={isUnread} isDone={isDone}
          style={{ marginBottom: spacing.sm, marginHorizontal: spacing.lg }}>
          <Pressable onPress={() => { setExpanded(!expanded); onPress(n); }} hitSlop={8}>
            {/* Row: icon + title + time + chevron */}
            <View style={s.topRow}>
              <View style={[s.typeRow, { flex: 1, minWidth: 0 }]}>
                <View style={[s.iconCircle, { backgroundColor: config.color + '20' }]}>
                  <SmartIcon name={config.icon} size={14} color={config.color} />
                </View>
                <Badge label={config.label} variant={config.badgeVariant} size="small" />
                <Text style={[s.titleP3, { flex: 1, minWidth: 0 }]} numberOfLines={expanded ? undefined : 1}>{n.title}</Text>
              </View>
              <View style={s.typeRow}>
                <Text style={[s.timeText, { color: colors.textSecondary }]}>{timeAgo(n.created_at)}</Text>
                {isUnread && <View style={[s.unreadDotSmall, { backgroundColor: config.color }]} />}
                <SmartIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textDisabled} />
              </View>
            </View>

            {/* Preview body (1 line) even when collapsed */}
            {!expanded && <Text style={[s.body, { marginTop: 4 }]} numberOfLines={1}>{n.body}</Text>}
          </Pressable>

          {expanded && (
            <>
              <Text style={[s.body, { marginTop: spacing.sm }]}>{n.body}</Text>
              <ChipRow chips={n.chips} />
              <AskTomoButton n={n} colors={colors} s={s} navigation={navigation} />
            </>
          )}
        </CardShell>
      </Animated.View>
    );
  }

  // ── P4: Info Chip ──
  return (
    <Animated.View entering={FadeInDown.delay(getAnimationDelay(index)).duration(350).springify()}>
      <CardShell config={config} isUnread={isUnread} isDone={isDone}
        style={{ marginBottom: spacing.xs, marginHorizontal: spacing.lg, padding: spacing.compact }}>
        <Pressable
          onPress={() => { setExpanded(!expanded); onPress(n); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
        >
          <View style={[s.iconCircleSm, { backgroundColor: config.color + '20' }]}>
            <SmartIcon name={config.icon} size={12} color={config.color} />
          </View>
          <Badge label={config.label} variant={config.badgeVariant} size="small" />
          <Text style={[s.titleP4, { flex: 1, minWidth: 120 }]} numberOfLines={1}>{n.title}</Text>
          <Text style={[s.timeText, { color: colors.textDisabled }]}>{timeAgo(n.created_at)}</Text>
          {n.category !== 'critical' && !isDone && (
            <Pressable onPress={() => onDismiss(n)} hitSlop={12}>
              <SmartIcon name="close-circle" size={18} color={colors.textDisabled} />
            </Pressable>
          )}
        </Pressable>
        {expanded && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={s.body}>{n.body}</Text>
            <AskTomoButton n={n} colors={colors} s={s} navigation={navigation} />
          </View>
        )}
      </CardShell>
    </Animated.View>
  );
}

// ─── Chip Row ─────────────────────────────────────────────────────────

function ChipRow({ chips }: { chips: Chip[] }) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
      {chips.map((chip, i) => {
        const cc = getChipColor(chip.style);
        return (
          <View key={i} style={{
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: borderRadius.full, backgroundColor: cc.bg,
          }}>
            <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cc.text }}>{chip.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Ask Tomo Button — uses shared AskTomoChip ─────────────────────

function AskTomoButton({
  n,
}: {
  n: NotificationData;
  colors?: any;
  s?: any;
  navigation?: any;
}) {
  if (n.status === 'acted' || n.status === 'dismissed') return null;
  const prefill = buildPrefill(n);
  return (
    <View style={{ marginTop: spacing.md }}>
      <AskTomoChip prompt={prefill} label="Ask Tomo" noMargin />
    </View>
  );
}

function buildPrefill(n: NotificationData): string {
  const chipSummary = Array.isArray(n.chips) && n.chips.length > 0
    ? ` (${n.chips.map((c) => c.label).join(', ')})`
    : '';
  return `${n.title}${chipSummary} — ${n.body}`;
}

// ─── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    titleP1: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textPrimary,
      lineHeight: 22,
      flex: 1,
    },
    titleP2: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
      marginBottom: spacing.xs,
    },
    titleP3: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textPrimary,
      flex: 1,
    },
    titleP4: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textPrimary,
    },
    body: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textBody,
      lineHeight: 18,
    },
    timeText: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },
    iconCircleLg: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconCircleSm: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    unreadDot: {
      position: 'absolute',
      top: 12,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    unreadDotSmall: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    askTomoBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      overflow: 'hidden' as const,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    askTomoText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
  });
}
