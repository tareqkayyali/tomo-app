/**
 * SubTabContext — Registry for sub-tab controllers per main tab.
 *
 * Screens with sub-tabs (TrainingScreen, TestsScreen) register their
 * sub-tab state here so MainNavigator's swipe logic can cycle through
 * sub-tabs before switching main tabs.
 */

import React, { createContext, useContext, useRef, useCallback } from 'react';

export interface SubTabController {
  /** Ordered list of sub-tab keys */
  tabs: string[];
  /** Current active sub-tab index */
  activeIndex: number;
  /** Switch to a specific sub-tab by index */
  setTab: (index: number) => void;
}

interface SubTabRegistry {
  /** Register a sub-tab controller for a main tab */
  register: (mainTab: string, controller: SubTabController) => void;
  /** Unregister when screen unmounts */
  unregister: (mainTab: string) => void;
  /** Get the controller for a main tab (null if no sub-tabs) */
  get: (mainTab: string) => SubTabController | null;
}

const SubTabContext = createContext<SubTabRegistry | null>(null);

export function SubTabProvider({ children }: { children: React.ReactNode }) {
  const registryRef = useRef<Record<string, SubTabController>>({});

  const register = useCallback((mainTab: string, controller: SubTabController) => {
    registryRef.current[mainTab] = controller;
  }, []);

  const unregister = useCallback((mainTab: string) => {
    delete registryRef.current[mainTab];
  }, []);

  const get = useCallback((mainTab: string): SubTabController | null => {
    return registryRef.current[mainTab] ?? null;
  }, []);

  return (
    <SubTabContext.Provider value={{ register, unregister, get }}>
      {children}
    </SubTabContext.Provider>
  );
}

/**
 * Hook for screens to register their sub-tabs with the swipe system.
 */
export function useSubTabRegistry() {
  const ctx = useContext(SubTabContext);
  if (!ctx) throw new Error('useSubTabRegistry must be used within SubTabProvider');
  return ctx;
}

/**
 * Hook for MainNavigator to access the registry for swipe logic.
 */
export function useSubTabs() {
  const ctx = useContext(SubTabContext);
  if (!ctx) throw new Error('useSubTabs must be used within SubTabProvider');
  return ctx;
}
