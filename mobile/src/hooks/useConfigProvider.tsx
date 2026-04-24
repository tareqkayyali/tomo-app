/**
 * ConfigProvider — React Context providing UI config (theme, pages, flags).
 * Mirrors ContentProvider: loads from cache on mount, syncs in background.
 *
 * Supports CMS preview mode via postMessage:
 * - Parent sends TOMO_DRAFT_THEME to override theme colors/typography
 * - Parent sends TOMO_DRAFT_PAGE_CONFIG to override a page's sections/metadata
 * - Parent sends TOMO_PREVIEW_MODE to enable preview mode (skip auth)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform, InteractionManager } from 'react-native';
import type { ConfigBundle, AppThemeRow, PageConfigRow } from '../services/configService';
import { syncConfig, forceRefreshConfig } from '../services/configService';
import { getCachedConfigBundle } from '../services/configCache';

interface ConfigContextValue {
  config: ConfigBundle | null;
  isLoading: boolean;
  lastSynced: string | null;
  isPreviewMode: boolean;
  refresh: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue>({
  config: null,
  isLoading: true,
  lastSynced: null,
  isPreviewMode: false,
  refresh: async () => {},
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const mounted = useRef(true);
  // Keep a ref to the API-fetched config so drafts can merge on top
  const baseConfigRef = useRef<ConfigBundle | null>(null);

  const doSync = useCallback(async () => {
    try {
      // Always fetch fresh bundle (not manifest-gated) to ensure theme changes
      // reflect immediately. The bundle API has max-age=60 so CDN handles caching.
      const bundle = await forceRefreshConfig();
      if (mounted.current && bundle) {
        baseConfigRef.current = bundle;
        setConfig(bundle);
        setLastSynced(bundle.fetched_at);
      }
    } catch {
      // Sync failed — keep existing config
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Check for preview mode via URL query param (web only)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('preview') === 'true') {
        setIsPreviewMode(true);
      }
    }

    getCachedConfigBundle().then((cached) => {
      if (mounted.current) {
        if (cached) {
          baseConfigRef.current = cached;
          setConfig(cached);
          setLastSynced(cached.fetched_at);
        }
        setIsLoading(false);
      }
    });

    // Background sync deferred until after first frame so it doesn't
    // compete with auth + boot on cold start.
    const task = InteractionManager.runAfterInteractions(() => {
      doSync();
    });

    return () => {
      mounted.current = false;
      task.cancel();
    };
  }, [doSync]);

  // Listen for postMessage from CMS admin (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type) return;

      if (data.type === 'TOMO_PREVIEW_MODE') {
        setIsPreviewMode(!!data.payload?.enabled);
        return;
      }

      // TOMO_DRAFT_THEME disabled — Tomo 友 uses local palette only
      if (data.type === 'TOMO_DRAFT_THEME') {
        return;
      }

      if (data.type === 'TOMO_DRAFT_COMPONENT_STYLES') {
        setConfig((prev) => {
          const base = baseConfigRef.current || prev;
          if (!base) return prev;
          return {
            ...base,
            component_styles: {
              ...(base.component_styles || {}),
              ...(data.payload || {}),
            },
          };
        });
        return;
      }

      if (data.type === 'TOMO_DRAFT_PAGE_CONFIG') {
        const screenKey = data.payload?.screen_key;
        if (!screenKey) return;

        setConfig((prev) => {
          const base = baseConfigRef.current || prev;
          if (!base) return prev;

          const draftPage: PageConfigRow = {
            id: 'draft',
            screen_key: screenKey,
            screen_label: data.payload?.screen_label || screenKey,
            sections: data.payload?.sections || [],
            metadata: data.payload?.metadata || {},
            color_overrides: data.payload?.color_overrides || {},
            is_published: true,
          };

          // Replace or add the page config for this screen
          const pages = base.pages.filter((p) => p.screen_key !== screenKey);
          pages.push(draftPage);

          return { ...base, pages };
        });
        return;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await doSync();
    if (mounted.current) setIsLoading(false);
  }, [doSync]);

  return (
    <ConfigContext.Provider value={{ config, isLoading, lastSynced, isPreviewMode, refresh }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
