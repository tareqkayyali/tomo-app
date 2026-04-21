/**
 * usePrograms — Program interaction state for the Signal Dashboard Programs tab.
 *
 * Responsibilities:
 *   - Fetch the athlete's currently-active and player-added programs (full snapshots).
 *   - Provide optimistic toggle / done / dismiss handlers that persist the full
 *     program payload so the UI survives AI re-generation.
 *   - Expose a single derived "forYou" list: all programs the athlete has NOT
 *     activated yet (coach + AI-recommended + player-added), deduped against the
 *     active set.
 *
 * Kept separate from useOutputData so the program interaction state can be
 * refreshed independently of the (heavier) output snapshot.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchActivePrograms,
  interactWithProgram,
  type ActiveProgramEntry,
  type OutputSnapshot,
} from '../services/api';
import { emitRefresh } from '../utils/refreshBus';

type Recommendation = OutputSnapshot['programs']['recommendations'][0];
type Source = 'coach' | 'ai_recommended' | 'player_added';

interface UseProgramsResult {
  active: ActiveProgramEntry[];
  playerAdded: ActiveProgramEntry[];
  activeIds: string[];
  playerSelectedIds: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  toggleActive: (program: Recommendation) => Promise<void>;
  markDone: (programId: string) => Promise<void>;
  markDismissed: (programId: string) => Promise<void>;
  removePlayerAdded: (programId: string) => Promise<void>;
}

function sourceOf(program: Recommendation): Source {
  if (program.source === 'coach' || program.source === 'player_added' || program.source === 'ai_recommended') {
    return program.source;
  }
  if (program.coachId || program.programId?.startsWith('coach_')) return 'coach';
  return 'ai_recommended';
}

export function usePrograms(): UseProgramsResult {
  const [active, setActive] = useState<ActiveProgramEntry[]>([]);
  const [playerAdded, setPlayerAdded] = useState<ActiveProgramEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchActivePrograms();
      setActive(res.active || []);
      setPlayerAdded(res.playerAdded || []);
    } catch {
      // Non-fatal — Programs tab will just show an empty Active section.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleActive = useCallback(async (program: Recommendation) => {
    const id = program.programId;
    const isActive = active.some((a) => a.programId === id);
    const source = sourceOf(program);

    // Optimistic update
    if (isActive) {
      setActive((prev) => prev.filter((a) => a.programId !== id));
    } else {
      setActive((prev) => [
        ...prev,
        { programId: id, program, source, activatedAt: new Date().toISOString() },
      ]);
    }

    try {
      await interactWithProgram(id, 'active', {
        programSnapshot: program,
        source,
      });
      emitRefresh('programs');
    } catch {
      // Rollback on failure
      await refresh();
    }
  }, [active, refresh]);

  const markDone = useCallback(async (programId: string) => {
    setActive((prev) => prev.filter((a) => a.programId !== programId));
    setPlayerAdded((prev) => prev.filter((a) => a.programId !== programId));
    try {
      await interactWithProgram(programId, 'done');
      emitRefresh('programs');
    } catch {
      await refresh();
    }
  }, [refresh]);

  const markDismissed = useCallback(async (programId: string) => {
    setActive((prev) => prev.filter((a) => a.programId !== programId));
    setPlayerAdded((prev) => prev.filter((a) => a.programId !== programId));
    try {
      await interactWithProgram(programId, 'dismissed');
      emitRefresh('programs');
    } catch {
      await refresh();
    }
  }, [refresh]);

  const removePlayerAdded = useCallback(async (programId: string) => {
    setPlayerAdded((prev) => prev.filter((a) => a.programId !== programId));
    setActive((prev) => prev.filter((a) => a.programId !== programId));
    try {
      await interactWithProgram(programId, 'player_selected');
      emitRefresh('programs');
    } catch {
      await refresh();
    }
  }, [refresh]);

  return {
    active,
    playerAdded,
    activeIds: active.map((a) => a.programId),
    playerSelectedIds: playerAdded.map((a) => a.programId),
    loading,
    refresh,
    toggleActive,
    markDone,
    markDismissed,
    removePlayerAdded,
  };
}
