/**
 * Content Service — Fetches and syncs global content from the backend.
 * 3-tier fallback: Fresh DB → Stale cache → Bundled fallback.
 */

import { API_BASE_URL, REQUEST_TIMEOUT } from './apiConfig';
import {
  getCachedManifest,
  setCachedManifest,
  getCachedBundle,
  setCachedBundle,
} from './contentCache';

// ═══ TYPES ═══

export interface ContentManifest {
  sports: string;
  sport_attributes: string;
  sport_skills: string;
  sport_positions: string;
  sport_rating_levels: string;
  sport_test_definitions: string;
  sport_normative_data: string;
  content_items: string;
}

export interface ContentBundle {
  sports: any[];
  sport_attributes: any[];
  sport_skills: any[];
  sport_positions: any[];
  sport_rating_levels: any[];
  sport_test_definitions: any[];
  sport_normative_data: any[];
  content_items: any[];
  fetched_at: string;
}

// ═══ FETCH HELPERS ═══

async function fetchJSON<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchContentManifest(): Promise<ContentManifest> {
  return fetchJSON<ContentManifest>('/api/v1/content/manifest');
}

export async function fetchContentBundle(): Promise<ContentBundle> {
  return fetchJSON<ContentBundle>('/api/v1/content/bundle');
}

// ═══ SYNC ORCHESTRATOR ═══

/**
 * Check manifest → fetch if stale → save to AsyncStorage.
 * Returns the content bundle (fresh, cached, or null).
 */
export async function syncContent(): Promise<ContentBundle | null> {
  try {
    // 1. Check remote manifest
    const remoteManifest = await fetchContentManifest();
    const localManifest = await getCachedManifest();

    // 2. Compare hashes — if identical, cache is still fresh
    if (localManifest && manifestsMatch(localManifest, remoteManifest)) {
      const cached = await getCachedBundle();
      if (cached) return cached;
    }

    // 3. Fetch full bundle
    const bundle = await fetchContentBundle();
    await setCachedBundle(bundle);
    await setCachedManifest(remoteManifest);
    return bundle;
  } catch {
    // Network failure — return cached bundle if available
    return getCachedBundle();
  }
}

function manifestsMatch(a: ContentManifest, b: ContentManifest): boolean {
  const keys: (keyof ContentManifest)[] = [
    'sports', 'sport_attributes', 'sport_skills', 'sport_positions',
    'sport_rating_levels', 'sport_test_definitions', 'sport_normative_data',
    'content_items',
  ];
  return keys.every((k) => a[k] === b[k]);
}
