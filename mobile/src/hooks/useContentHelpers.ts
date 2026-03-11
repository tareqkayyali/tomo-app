/**
 * Content Helpers — Utility hooks for accessing ContentBundle data.
 *
 * Provides type-safe access to content items (quotes, phone tests, drills,
 * onboarding, pro milestones) from the ContentBundle with automatic fallback
 * to hardcoded data when the bundle is unavailable.
 *
 * Usage:
 *   const quotes = useQuotes('high_energy');
 *   const phoneTests = usePhoneTests();
 *   const drills = useBlazePodDrills();
 *   const items = useContentItems('onboarding', 'sport_options');
 */

import { useMemo } from 'react';
import { useContent } from './useContentProvider';
import type { ContentBundle } from '../services/contentService';

// ═══ TYPES ═══

export interface Quote {
  text: string;
  author: string;
}

export interface PhoneTestDef {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  category: string;
  description: string;
  durationSeconds: number;
  instructions: string[];
  unit: string;
}

export interface BlazePodDrill {
  name: string;
  description: string;
  pods: number;
  duration: string;
  mode: string;
  icon: string;
  color: string;
}

export interface ProMilestone {
  rating: number;
  name: string;
  reason: string;
}

// ═══ RAW CONTENT ITEM EXTRACTORS ═══

/**
 * Extract content items from bundle by category/subcategory/sport.
 * Returns empty array if bundle is null.
 */
export function extractContentItems(
  bundle: ContentBundle | null,
  category: string,
  subcategory?: string,
  sportId?: string,
): any[] {
  if (!bundle) return [];
  return bundle.content_items
    .filter((item: any) => {
      if (item.category !== category) return false;
      if (subcategory && item.subcategory !== subcategory) return false;
      if (sportId && item.sport_id && item.sport_id !== sportId) return false;
      if (item.active === false) return false;
      return true;
    })
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Extract quotes from bundle by subcategory.
 */
export function extractQuotes(
  bundle: ContentBundle | null,
  subcategory: string,
): Quote[] {
  const items = extractContentItems(bundle, 'quotes', subcategory);
  return items.map((item: any) => ({
    text: item.content?.text ?? '',
    author: item.content?.author ?? '',
  }));
}

/**
 * Extract phone test definitions from bundle.
 */
export function extractPhoneTests(bundle: ContentBundle | null): PhoneTestDef[] {
  const items = extractContentItems(bundle, 'phone_tests');
  return items.map((item: any) => ({
    id: item.key || item.content?.id || '',
    name: item.content?.name ?? '',
    shortName: item.content?.shortName ?? '',
    icon: item.content?.icon ?? '',
    color: item.content?.color ?? '',
    category: item.content?.category ?? '',
    description: item.content?.description ?? '',
    durationSeconds: item.content?.durationSeconds ?? 0,
    instructions: item.content?.instructions ?? [],
    unit: item.content?.unit ?? '',
  }));
}

/**
 * Extract BlazePod drill definitions from bundle.
 */
export function extractBlazePodDrills(
  bundle: ContentBundle | null,
): BlazePodDrill[] {
  const items = extractContentItems(bundle, 'blazepod_drills');
  return items.map((item: any) => ({
    name: item.content?.name ?? '',
    description: item.content?.description ?? '',
    pods: item.content?.pods ?? 0,
    duration: item.content?.duration ?? '',
    mode: item.content?.mode ?? '',
    icon: item.content?.icon ?? '',
    color: item.content?.color ?? '',
  }));
}

/**
 * Extract pro milestones from bundle for a sport.
 */
export function extractProMilestones(
  bundle: ContentBundle | null,
  sportId: string,
): ProMilestone[] {
  const items = extractContentItems(bundle, 'pro_milestones', '', sportId);
  return items.map((item: any) => ({
    rating: item.content?.rating ?? 0,
    name: item.content?.name ?? '',
    reason: item.content?.reason ?? '',
  }));
}

// ═══ REACT HOOKS ═══

/**
 * Get quotes by subcategory from ContentBundle.
 * Falls back to empty array when bundle unavailable.
 *
 * @param subcategory - 'high_energy' | 'recovery' | 'low_sleep' | 'streak' | 'general'
 */
export function useQuotes(subcategory: string): Quote[] {
  const { content } = useContent();
  return useMemo(() => extractQuotes(content, subcategory), [content, subcategory]);
}

/**
 * Get all quotes organized by subcategory.
 */
export function useAllQuotes(): Record<string, Quote[]> {
  const { content } = useContent();
  return useMemo(() => ({
    high_energy: extractQuotes(content, 'high_energy'),
    recovery: extractQuotes(content, 'recovery'),
    low_sleep: extractQuotes(content, 'low_sleep'),
    streak: extractQuotes(content, 'streak'),
    general: extractQuotes(content, 'general'),
  }), [content]);
}

/**
 * Get phone test definitions from ContentBundle.
 */
export function usePhoneTests(): PhoneTestDef[] {
  const { content } = useContent();
  return useMemo(() => extractPhoneTests(content), [content]);
}

/**
 * Get BlazePod drill definitions from ContentBundle.
 */
export function useBlazePodDrills(): BlazePodDrill[] {
  const { content } = useContent();
  return useMemo(() => extractBlazePodDrills(content), [content]);
}

/**
 * Get pro milestones for a sport from ContentBundle.
 */
export function useProMilestones(sportId: string): ProMilestone[] {
  const { content } = useContent();
  return useMemo(
    () => extractProMilestones(content, sportId),
    [content, sportId],
  );
}

/**
 * Generic content items hook with category/subcategory filter.
 */
export function useContentItems(
  category: string,
  subcategory?: string,
  sportId?: string,
): any[] {
  const { content } = useContent();
  return useMemo(
    () => extractContentItems(content, category, subcategory, sportId),
    [content, category, subcategory, sportId],
  );
}

// ═══ SPORT OPTIONS ═══

const FALLBACK_SPORT_OPTIONS = [
  { value: 'padel', label: 'Padel', icon: 'tennisball', color: '#FF6B35', available: true },
  { value: 'football', label: 'Football', icon: 'football', color: '#30D158', available: true },
  { value: 'basketball', label: 'Basketball', icon: 'basketball', color: '#FF9500', available: false },
  { value: 'tennis', label: 'Tennis', icon: 'tennisball-outline', color: '#00D9FF', available: false },
];

/**
 * Returns available sport options from content bundle (sports table),
 * falling back to a hardcoded list.
 */
export function useSportOptions(): Array<{
  value: string;
  label: string;
  icon: string;
  color: string;
  available: boolean;
}> {
  const { content } = useContent();
  return useMemo(() => {
    if (!content?.sports?.length) return FALLBACK_SPORT_OPTIONS;
    return content.sports
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        value: s.id,
        label: s.label,
        icon: s.icon,
        color: s.color,
        available: s.available ?? false,
      }));
  }, [content]);
}
