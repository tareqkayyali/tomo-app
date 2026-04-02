/**
 * Shared notification constants — single source of truth for category colors,
 * chip styles, and animation limits across all notification components.
 */

import type { Ionicons } from '@expo/vector-icons';
import type { GlowPreset } from '../GlowWrapper';

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
  critical: { color: '#E74C3C', icon: 'flash', label: 'Critical', glow: 'orange', badgeVariant: 'error', tintBg: 'rgba(231, 76, 60, 0.08)' },
  training: { color: '#F4501E', icon: 'calendar', label: 'Training', glow: 'orange', badgeVariant: 'warning', tintBg: 'rgba(244, 80, 30, 0.06)' },
  coaching: { color: '#2ECC71', icon: 'star', label: 'Coaching', glow: 'cyan', badgeVariant: 'success', tintBg: 'rgba(46, 204, 113, 0.06)' },
  academic: { color: '#3498DB', icon: 'book', label: 'Academic', glow: 'cyan', badgeVariant: 'info', tintBg: 'rgba(52, 152, 219, 0.06)' },
  triangle: { color: '#8E44AD', icon: 'diamond', label: 'Triangle', glow: 'subtle', badgeVariant: 'chip', tintBg: 'rgba(142, 68, 173, 0.06)' },
  cv:       { color: '#F39C12', icon: 'person-circle', label: 'CV', glow: 'subtle', badgeVariant: 'warning', tintBg: 'rgba(243, 156, 18, 0.06)' },
  system:   { color: '#888888', icon: 'information-circle', label: 'System', glow: 'none', badgeVariant: 'chip', tintBg: 'rgba(136, 136, 136, 0.04)' },
};

// ─── Chip Colors ─────────────────────────────────────────────────────

export const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: 'rgba(231, 76, 60, 0.18)', text: '#E74C3C' },
  green:  { bg: 'rgba(46, 204, 113, 0.18)', text: '#2ECC71' },
  amber:  { bg: 'rgba(243, 156, 18, 0.18)', text: '#F39C12' },
  blue:   { bg: 'rgba(52, 152, 219, 0.18)', text: '#3498DB' },
  orange: { bg: 'rgba(244, 80, 30, 0.18)', text: '#F4501E' },
  purple: { bg: 'rgba(142, 68, 173, 0.18)', text: '#8E44AD' },
  gray:   { bg: 'rgba(136, 136, 136, 0.18)', text: '#888888' },
  teal:   { bg: 'rgba(0, 217, 255, 0.18)', text: '#00D9FF' },
};

/** Safe chip color lookup — falls back to amber for unknown styles */
export function getChipColor(style: string): { bg: string; text: string } {
  return CHIP_COLORS[style] ?? CHIP_COLORS.amber;
}

// ─── Filter Bar Categories ───────────────────────────────────────────

/** Filter categories shown in UI — system notifications are not filterable */
export type CategoryFilter = 'all' | 'critical' | 'training' | 'coaching' | 'academic' | 'triangle' | 'cv';

export const FILTER_CATEGORIES: { key: CategoryFilter; label: string; color: string }[] = [
  { key: 'all',      label: 'All',      color: '#2ECC71' },
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
