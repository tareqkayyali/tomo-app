/**
 * Config Service — Fetches and syncs UI config (theme, page configs, feature flags).
 * Mirrors the content sync pattern: manifest check → fetch if stale → cache.
 */

import { API_BASE_URL, REQUEST_TIMEOUT } from './apiConfig';
import {
  getCachedConfigManifest,
  setCachedConfigManifest,
  getCachedConfigBundle,
  setCachedConfigBundle,
} from './configCache';

// ═══ TYPES ═══

export interface ConfigManifest {
  app_themes: string | null;
  page_configs: string | null;
  feature_flags: string | null;
  ui_config: string | null;
}

export interface SectionConfig {
  sectionId: string;
  title: string;
  subtitle?: string;
  visible: boolean;
  sortOrder: number;
  cardVariant?: 'blob' | 'rounded' | 'glass' | 'muted' | 'elevated' | 'outlined';
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
    paddingHorizontal?: number;
  };
  style?: Record<string, unknown>;
}

export interface PageMetadata {
  pageTitle?: string;
  subtitle?: string;
  tabLabels?: Record<string, string>;
  emptyStates?: Record<string, string>;
}

export interface PageColorOverrides {
  dark?: Record<string, string>;
  light?: Record<string, string>;
}

export interface PageConfigRow {
  id: string;
  screen_key: string;
  screen_label: string;
  sections: SectionConfig[];
  metadata: PageMetadata;
  color_overrides: PageColorOverrides;
  is_published: boolean;
}

export interface AppThemeRow {
  id: string;
  name: string;
  colors_dark: Record<string, unknown>;
  colors_light: Record<string, unknown>;
  typography: Record<string, unknown>;
  is_active: boolean;
}

export interface FeatureFlagRow {
  id: string;
  flag_key: string;
  enabled: boolean;
  description: string;
  sports: string[] | null;
}

/** Per-component typography overrides keyed by component identifier */
export type ComponentStyles = Record<string, {
  fontSize?: number;
  fontWeight?: string;
  letterSpacing?: number;
}>;

export interface ConfigBundle {
  theme: AppThemeRow | null;
  pages: PageConfigRow[];
  flags: FeatureFlagRow[];
  component_styles: ComponentStyles;
  proactive_dashboard: DashboardConfig | null;
  fetched_at: string;
}

// ═══ PROACTIVE DASHBOARD CONFIG (CMS-managed) ═══

export interface DashboardConfig {
  greeting: { enabled: boolean; showEmoji: boolean; customPrefix?: string };
  pills: DashboardPillConfig[];
  todaySection: {
    enabled: boolean;
    maxEvents: number;
    showEventTime: boolean;
    showRestDayMessage: boolean;
    restDayMessage: string;
  };
  flags: DashboardFlagConfig[];
  chips: DashboardChipConfig[];
  newUserMessage: string;
}

export interface DashboardPillConfig {
  id: string;
  label: string;
  emoji: string;
  dataSource: string;
  format: string;
  enabled: boolean;
  emptyValue: string;
  colorRules?: { green?: string; yellow?: string; red?: string };
  tapAction?: string;
  tapHint?: string;
  sortOrder: number;
}

export interface DashboardFlagConfig {
  id: string;
  condition: string;
  icon: string;
  message: string;
  color: string;
  priority: number;
  enabled: boolean;
}

export interface DashboardChipConfig {
  id: string;
  label: string;
  message: string;
  condition?: string;
  priority: number;
  enabled: boolean;
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

export async function fetchConfigManifest(): Promise<ConfigManifest> {
  return fetchJSON<ConfigManifest>('/api/v1/config/manifest');
}

export async function fetchConfigBundle(): Promise<ConfigBundle> {
  return fetchJSON<ConfigBundle>('/api/v1/config/bundle');
}

// ═══ SYNC ORCHESTRATOR ═══

export async function syncConfig(): Promise<ConfigBundle | null> {
  try {
    const remoteManifest = await fetchConfigManifest();
    const localManifest = await getCachedConfigManifest();

    // If manifests match AND we have a cached bundle, use cache
    if (localManifest && manifestsMatch(localManifest, remoteManifest)) {
      const cached = await getCachedConfigBundle();
      if (cached) return cached;
    }

    // Manifests differ or no cache — fetch fresh bundle
    const bundle = await fetchConfigBundle();
    await setCachedConfigBundle(bundle);
    await setCachedConfigManifest(remoteManifest);
    return bundle;
  } catch {
    // Network failed — use cache as fallback
    return getCachedConfigBundle();
  }
}

/**
 * Force-refresh: bypasses manifest check, always fetches fresh bundle.
 * Call this from pull-to-refresh or settings to guarantee latest theme.
 */
export async function forceRefreshConfig(): Promise<ConfigBundle | null> {
  try {
    const [bundle, manifest] = await Promise.all([
      fetchConfigBundle(),
      fetchConfigManifest(),
    ]);
    await setCachedConfigBundle(bundle);
    await setCachedConfigManifest(manifest);
    return bundle;
  } catch {
    return getCachedConfigBundle();
  }
}

function manifestsMatch(a: ConfigManifest, b: ConfigManifest): boolean {
  return (
    a.app_themes === b.app_themes &&
    a.page_configs === b.page_configs &&
    a.feature_flags === b.feature_flags &&
    a.ui_config === b.ui_config
  );
}
