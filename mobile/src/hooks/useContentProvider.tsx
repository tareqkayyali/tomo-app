/**
 * ContentProvider — React Context providing the global ContentBundle to the app.
 *
 * On mount: loads from AsyncStorage cache (instant), then syncs in background.
 * Exposes: content, isLoading, lastSynced, refresh()
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ContentBundle } from '../services/contentService';
import { syncContent } from '../services/contentService';
import { getCachedBundle } from '../services/contentCache';

interface ContentContextValue {
  content: ContentBundle | null;
  isLoading: boolean;
  lastSynced: string | null;
  refresh: () => Promise<void>;
}

const ContentContext = createContext<ContentContextValue>({
  content: null,
  isLoading: true,
  lastSynced: null,
  refresh: async () => {},
});

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<ContentBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const mounted = useRef(true);

  const doSync = useCallback(async () => {
    try {
      const bundle = await syncContent();
      if (mounted.current && bundle) {
        setContent(bundle);
        setLastSynced(bundle.fetched_at);
      }
    } catch {
      // Sync failed — keep existing content
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // 1. Load from cache instantly
    getCachedBundle().then((cached) => {
      if (mounted.current) {
        if (cached) {
          setContent(cached);
          setLastSynced(cached.fetched_at);
        }
        setIsLoading(false);
      }
    });

    // 2. Background sync
    doSync();

    return () => {
      mounted.current = false;
    };
  }, [doSync]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await doSync();
    if (mounted.current) setIsLoading(false);
  }, [doSync]);

  return (
    <ContentContext.Provider value={{ content, isLoading, lastSynced, refresh }}>
      {children}
    </ContentContext.Provider>
  );
}

export function useContent(): ContentContextValue {
  return useContext(ContentContext);
}
