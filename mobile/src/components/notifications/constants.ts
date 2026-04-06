/**
 * Shared notification constants — single source of truth for category colors,
 * chip styles, and animation limits across all notification components.
 */

import type { Ionicons } from '@expo/vector-icons';
import type { GlowPreset } from '../GlowWrapper';
import { colors } from '../../theme/colors';

// ─── Category Types ──────────────────────────────────────────────────

export type NotificationCategory =
  | 'critical'
  | 'training'
  | 'coaching'
  | 'academic'
  | 'triangle'
  | 'cv'
  | 'system';

// ─── Category Configuration ──────────────────────────────────────────

export interface CategoryConfig {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  glow: GlowPreset;
  badgeVariant: 'chip' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  tintBg: string;
}

export const CATEGORY_CONFIG: Record<NotificationCategory, CategoryConfig> = {
  critical: { color: colors.textSecondary, icon: 'flash', label: 'Critical', glow: 'orange', badgeVariant: 'error', tintBg: colors.secondarySubtle },
  training: { color: colors.accent, icon: 'calendar', label: 'Training', glow: 'orange', badgeVariant: 'warning', tintBg: colors.accentSubtle },
  coaching: { color: colors.accent, icon: 'star', label: 'Coaching', glow: 'cyan', badgeVariant: 'success', tintBg: colors.accentSubtle },
  academic: { color: colors.textSecondary, icon: 'book', label: 'Academic', glow: 'cyan', badgeVariant: 'info', tintBg: colors.secondarySubtle },
  triangle: { color: colors.textSecondary, icon: 'diamond', label: 'Triangle', glow: 'subtle', badgeVariant: 'chip', tintBg: colors.secondarySubtle },
  cv:       { color: colors.textSecondary, icon: 'person-circle', label: 'CV', glow: 'subtle', badgeVariant: 'warning', tintBg: colors.secondarySubtle },
  system:   { color: colors.textSecondary, icon: 'information-circle', label: 'System', glow: 'none', badgeVariant: 'chip', tintBg: colors.secondarySubtle },
};

// ─── Chip Colors ─────────────────────────────────────────────────────

export const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: colors.secondaryMuted, text: colors.textSecondary },
  green:  { bg: colors.secondaryMuted, text: colors.accent },
  amber:  { bg: colors.secondaryMuted, text: colors.textSecondary },
  blue:   { bg: colors.secondaryMuted, text: colors.textSecondary },
  orange: { bg: colors.secondaryMuted, text: colors.accent },
  purple: { bg: colors.secondaryMuted, text: colors.textSecondary },
  gray:   { bg: colors.secondaryMuted, text: colors.textSecondary },
  teal:   { bg: colors.secondaryMuted, text: colors.accent },
};

/** Safe chip color lookup — falls back to amber for unknown styles */
export function getChipColor(style: string): { bg: string; text: string } {
  return CHIP_COLORS[style] ?? CHIP_COLORS.amber;
}

// ─── Filter Bar Categories ───────────────────────────────────────────

/** Filter categories shown in UI — system notifications are not filterable */
export type CategoryFilter = 'all' | 'critical' | 'training' | 'coaching' | 'academic' | 'triangle' | 'cv';

export const FILTER_CATEGORIES: { key: CategoryFilter; label: string; color: string }[] = [
  { key: 'all',      label: 'All',      color: colors.accent },
  { key: 'critical', label: 'Critical', color: CATEGORY_CONFIG.critical.color },
  { key: 'training', label: 'Training', color: CATEGORY_CONFIG.training.color },
  { key: 'coaching', label: 'Coaching', color: CATEGORY_CONFIG.coaching.color },
  { key: 'academic', label: 'Academic', color: CATEGORY_CONFIG.academic.color },
  { key: 'triangle', label: 'Triangle', color: CATEGORY_CONFIG.triangle.color },
  { key: 'cv',       label: 'CV',       color: CATEGORY_CONFIG.cv.color },
];

// ─── Animation Limits ────────────────────────────────────────────────

/** Max stagger delay for FadeInDown animations (prevents lag on large lists) */
export const MAX_ANIMATION_DELAY_MS = 800;

/** Per-item stagger delay (ms) */
export const ITEM_STAGGER_MS = 80;

/** Compute capped animation delay for an item at given index */
export function getAnimationDelay(index: number): number {
  return Math.min(index * ITEM_STAGGER_MS, MAX_ANIMATION_DELAY_MS);
}
