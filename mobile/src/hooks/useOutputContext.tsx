/**
 * OutputProvider — Shared output snapshot context for authenticated players.
 *
 * Mounts eagerly inside AuthProvider so the first fetch starts at login,
 * not when the Dashboard tab is first rendered (which lazy tabs defer until
 * the athlete taps the tab). Screens that show own-player data subscribe
 * via useOutput() and receive the same already-in-flight or cached result.
 *
 * Coach tabs that view a specific player's data continue calling
 * useOutputData(targetPlayerId) directly — they are NOT covered by this context
 * since each target player is a distinct data source.
 */

import React, { createContext, useContext } from 'react';
import { useOutputData } from './useOutputData';

type OutputContextValue = ReturnType<typeof useOutputData>;

const OutputContext = createContext<OutputContextValue | null>(null);

export function OutputProvider({ children }: { children: React.ReactNode }) {
  const output = useOutputData();
  return <OutputContext.Provider value={output}>{children}</OutputContext.Provider>;
}

/**
 * Returns the authenticated player's own output snapshot from the shared
 * provider. Must be rendered inside OutputProvider (mounted in App.tsx under
 * AuthProvider). Do NOT use for coach tabs viewing another player — use
 * useOutputData(targetPlayerId) directly there.
 */
export function useOutput(): OutputContextValue {
  const ctx = useContext(OutputContext);
  if (!ctx) throw new Error('useOutput must be rendered inside OutputProvider');
  return ctx;
}
