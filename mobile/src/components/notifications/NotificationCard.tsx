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
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../SmartIcon';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { GlowWrapper, type GlowPreset } from '../GlowWrapper';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────

type NotificationCategory =
  | 'critical'
  | 'training'
  | 'coaching'
  | 'academic'
  | 'triangle'
  | 'cv'
  | 'system';

interface Chip {
  label: string;
  style: 'red' | 'green' | 'amber' | 'blue' | 'orange' | 'purple';
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

// ─── Category Config ──────────────────────────────────────────────────

interface CategoryConfig {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  glow: GlowPreset;
  badgeVariant: 'chip' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  tintBg: string; // subtle category-tinted card background
}

const CATEGORY_CONFIG: Record<NotificationCategory, CategoryConfig> = {
  critical: { color: '#E74C3C', icon: 'flash', label: 'Critical', glow: 'orange', badgeVariant: 'error', tintBg: 'rgba(231, 76, 60, 0.08)' },
  training: { color: '#F4501E', icon: 'calendar', label: 'Training', glow: 'orange', badgeVariant: 'warning', tintBg: 'rgba(244, 80, 30, 0.06)' },
  coaching: { color: '#2ECC71', icon: 'star', label: 'Coaching', glow: 'cyan', badgeVariant: 'success', tintBg: 'rgba(46, 204, 113, 0.06)' },
  academic: { color: '#3498DB', icon: 'book', label: 'Academic', glow: 'cyan', badgeVariant: 'info', tintBg: 'rgba(52, 152, 219, 0.06)' },
  triangle: { color: '#8E44AD', icon: 'diamond', label: 'Triangle', glow: 'subtle', badgeVariant: 'chip', tintBg: 'rgba(142, 68, 173, 0.06)' },
  cv: { color: '#F39C12', icon: 'person-circle', label: 'CV', glow: 'subtle', badgeVariant: 'warning', tintBg: 'rgba(243, 156, 18, 0.06)' },
  system: { color: '#888888', icon: 'information-circle', label: 'System', glow: 'none', badgeVariant: 'chip', tintBg: 'rgba(136, 136, 136, 0.04)' },
};

const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  red: { bg: 'rgba(231, 76, 60, 0.18)', text: '#E74C3C' },
  green: { bg: 'rgba(46, 204, 113, 0.18)', text: '#2ECC71' },
  amber: { bg: 'rgba(243, 156, 18, 0.18)', text: '#F39C12' },
  blue: { bg: 'rgba(52, 152, 219, 0.18)', text: '#3498DB' },
  orange: { bg: 'rgba(244, 80, 30, 0.18)', text: '#F4501E' },
  purple: { bg: 'rgba(142, 68, 173, 0.18)', text: '#8E44AD' },
};

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
          backgroundColor: '#1E1C20',
          borderRadius: borderRadius.lg,
          borderWidth: 1,
          borderColor: isUnread ? config.color + '40' : 'rgba(255,255,255,0.06)',
          borderLeftWidth: isUnread ? 3 : 1,
          borderLeftColor: isUnread ? config.color : 'rgba(255,255,255,0.06)',
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
      <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
        <GlowWrapper glow={config.glow} breathing style={{ marginBottom: spacing.md, marginHorizontal: spacing.lg }}>
          <CardShell config={config} isUnread={isUnread} isDone={isDone}
            style={{ backgroundColor: '#231A1A', borderColor: config.color + '60' }}>
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
      <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
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
      <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
        <CardShell config={config} isUnread={isUnread} isDone={isDone}
          style={{ marginBottom: spacing.sm, marginHorizontal: spacing.lg }}>
          <Pressable onPress={() => { setExpanded(!expanded); onPress(n); }} hitSlop={8}>
            {/* Row: icon + title + time + chevron */}
            <View style={s.topRow}>
              <View style={[s.typeRow, { flex: 1 }]}>
                <View style={[s.iconCircle, { backgroundColor: config.color + '20' }]}>
                  <SmartIcon name={config.icon} size={14} color={config.color} />
                </View>
                <Text style={s.titleP3} numberOfLines={expanded ? undefined : 1}>{n.title}</Text>
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
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <CardShell config={config} isUnread={isUnread} isDone={isDone}
        style={{ marginBottom: spacing.xs, marginHorizontal: spacing.lg, padding: spacing.compact }}>
        <Pressable
          onPress={() => { setExpanded(!expanded); onPress(n); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <View style={[s.iconCircleSm, { backgroundColor: config.color + '20' }]}>
            <SmartIcon name={config.icon} size={12} color={config.color} />
          </View>
          <Text style={[s.titleP4, { flex: 1 }]} numberOfLines={1}>{n.title}</Text>
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
        const cc = CHIP_COLORS[chip.style] ?? CHIP_COLORS.amber;
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

// ─── Ask Tomo Button ──────────────────────────────────────────────────

function AskTomoButton({
  n, colors, s, navigation,
}: {
  n: NotificationData;
  colors: ThemeColors;
  s: ReturnType<typeof createStyles>;
  navigation: any;
}) {
  if (n.status === 'acted' || n.status === 'dismissed') return null;

  const prefill = buildPrefill(n);

  return (
    <View style={{ marginTop: spacing.md }}>
      <Pressable
        onPress={() => {
          try {
            navigation.navigate('Main', {
              screen: 'MainTabs',
              params: { screen: 'Chat', params: { prefillMessage: prefill } },
            });
          } catch { /* Silent fallback for non-Main navigators */ }
        }}
        style={s.askTomoBtn}
      >
        <SmartIcon name="chatbubble-ellipses-outline" size={16} color={colors.info} />
        <Text style={[s.askTomoText, { color: colors.info }]}>Ask Tomo</Text>
      </Pressable>
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
      color: '#FFFFFF',
      lineHeight: 22,
      flex: 1,
    },
    titleP2: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: '#FFFFFF',
      lineHeight: 20,
      marginBottom: spacing.xs,
    },
    titleP3: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: '#FFFFFF',
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
      color: '#B0B0B0',
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(52, 152, 219, 0.12)',
      borderColor: 'rgba(52, 152, 219, 0.30)',
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: borderRadius.md,
    },
    askTomoText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
  });
}
