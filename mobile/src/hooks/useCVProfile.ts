/**
 * useCVProfile — Aggregates all data needed for the Player CV screen.
 * Fetches CV bundle (snapshot + clubs + competitions) from the API,
 * plus football progress data from the existing hook.
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../services/apiConfig';
import { getIdToken } from '../services/auth';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' };
}

export interface ClubEntry {
  id: string;
  club_name: string;
  role: string;
  start_year: number;
  end_year: number | null;
  achievements: string[];
  notes: string | null;
}

export interface CompetitionEntry {
  id: string;
  payload: {
    competition_name?: string;
    opponent?: string;
    result?: string;
    minutes_played?: number;
    performance_notes?: string;
    stats?: Record<string, number>;
  };
  created_at: string;
}

export interface CVBundleData {
  snapshot: Record<string, unknown> | null;
  clubs: ClubEntry[];
  competitions: CompetitionEntry[];
}

interface UseCVProfileReturn {
  data: CVBundleData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  addClub: (input: Omit<ClubEntry, 'id'>) => Promise<ClubEntry | null>;
  updateClub: (id: string, input: Partial<ClubEntry>) => Promise<boolean>;
  deleteClub: (id: string) => Promise<boolean>;
}

export function useCVProfile(athleteId: string): UseCVProfileReturn {
  const [data, setData] = useState<CVBundleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBundle = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `${API_BASE_URL}/api/v1/cv/profile?athleteId=${athleteId}`,
        { headers }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();
      setData(bundle);
    } catch (err) {
      setError(String(err));
    }
    setIsLoading(false);
  }, [athleteId]);

  useEffect(() => {
    if (athleteId) fetchBundle();
  }, [athleteId, fetchBundle]);

  const addClub = useCallback(async (input: Omit<ClubEntry, 'id'>): Promise<ClubEntry | null> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/clubs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const club = await res.json();
      setData((prev) => prev ? { ...prev, clubs: [club, ...prev.clubs] } : prev);
      return club;
    } catch {
      return null;
    }
  }, []);

  const updateClub = useCallback(async (id: string, input: Partial<ClubEntry>): Promise<boolean> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/clubs/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return false;
      const updated = await res.json();
      setData((prev) => prev ? {
        ...prev,
        clubs: prev.clubs.map((c) => c.id === id ? updated : c),
      } : prev);
      return true;
    } catch {
      return false;
    }
  }, []);

  const deleteClub = useCallback(async (id: string): Promise<boolean> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/clubs/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) return false;
      setData((prev) => prev ? {
        ...prev,
        clubs: prev.clubs.filter((c) => c.id !== id),
      } : prev);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { data, isLoading, error, refetch: fetchBundle, addClub, updateClub, deleteClub };
}
