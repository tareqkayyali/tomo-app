/**
 * useCVProfile — Fetches the full assembled CV bundle from the API.
 * Returns the complete FullCVBundle with all auto-populated + manual sections,
 * plus CRUD helpers for manual entry sections (career, academic, media, refs, traits).
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../services/apiConfig';
import { getIdToken } from '../services/auth';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' };
}

// ── Types (mirror backend cvAssembler types) ──

export interface CVIdentity {
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  nationality: string | null;
  passport_country: string | null;
  city_country: string | null;
  photo_url: string | null;
  email: string;
  phone: string | null;
  sport: string;
  position: string | null;
  preferred_foot: string | null;
  playing_style: string | null;
  secondary_positions: string[] | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
}

export interface CVPhysicalProfile {
  height_cm: number | null;
  weight_kg: number | null;
  phv_stage: string | null;
  phv_offset_years: number | null;
  academic_year: number | null;
}

export interface CVPositions {
  primary_position: string | null;
  secondary_positions: string[];
  formation_preference: string | null;
  dominant_zone: string | null;
}

export interface CVBenchmarkResult {
  metric_key: string;
  metric_label: string;
  value: number;
  unit: string;
  percentile: number;
  zone: string;
  direction: string;
  age_band: string;
  position: string;
  tested_at: string | null;
}

export interface CVPerformanceData {
  sessions_total: number;
  training_age_weeks: number;
  training_age_months: number;
  streak_days: number;
  last_session_at: string | null;
  last_checkin_at: string | null;
  acwr: number | null;
  atl_7day: number | null;
  ctl_28day: number | null;
  injury_risk_flag: string | null;
  readiness_score: number | null;
  readiness_rag: string | null;
  wellness_7day_avg: number | null;
  wellness_trend: string | null;
  benchmarks: CVBenchmarkResult[];
  overall_percentile: number | null;
  strengths: string[];
  gaps: string[];
  coachability: {
    score: number;
    label: string;
    components: {
      target_achievement_rate: number;
      adaptation_velocity: number;
      coach_responsiveness: number;
    };
    sufficient_data: boolean;
  } | null;
  data_start_date: string | null;
  verified_by: "tomo_platform";
}

export interface CVTrajectory {
  metric_trends: {
    metric_key: string;
    metric_label: string;
    data_points: { date: string; value: number; percentile: number; zone: string }[];
    total_improvement_pct: number | null;
  }[];
  narrative: string | null;
  narrative_last_generated: string | null;
}

export interface CVCompetitionEntry {
  id: string;
  competition_name: string | null;
  opponent: string | null;
  result: string | null;
  minutes_played: number | null;
  performance_notes: string | null;
  stats: Record<string, number> | null;
  date: string;
}

export interface CVCareerEntry {
  id: string;
  entry_type: string;
  club_name: string;
  league_level: string | null;
  country: string | null;
  position: string | null;
  started_month: string | null;
  ended_month: string | null;
  is_current: boolean;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  clean_sheets: number | null;
  achievements: string[];
  injury_note: string | null;
}

export interface CVAcademicEntry {
  id: string;
  institution: string;
  country: string | null;
  qualification: string | null;
  year_start: number | null;
  year_end: number | null;
  gpa: string | null;
  gpa_scale: string | null;
  predicted_grade: string | null;
  honours: string[];
  ncaa_eligibility_id: string | null;
  is_current: boolean;
}

export interface CVMediaLink {
  id: string;
  media_type: string;
  platform: string | null;
  url: string;
  title: string | null;
  is_primary: boolean;
}

export interface CVReference {
  id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  consent_given: boolean;
}

export interface CVCharacterTrait {
  id: string;
  trait_category: string;
  title: string;
  description: string | null;
  level: string | null;
  date: string | null;
}

export interface CVInjuryStatus {
  has_active_injury: boolean;
  pain_location: string | null;
  current_stage: number | null;
  cleared_at: string | null;
  status_label: string;
}

export interface CVStatements {
  personal_statement_club: string | null;
  personal_statement_uni: string | null;
  statement_status: string;
  statement_last_generated: string | null;
}

export interface CVDualRoleCompetency {
  dual_load_index: number | null;
  academic_load_7day: number | null;
  exam_period_training_rate: number | null;
  narrative: string | null;
  narrative_last_generated: string | null;
}

export interface CVCompletenessResult {
  club_pct: number;
  uni_pct: number;
  club_breakdown: Record<string, { score: number; max: number; label: string }>;
  uni_breakdown: Record<string, { score: number; max: number; label: string }>;
  next_actions_club: string[];
  next_actions_uni: string[];
}

export type CVSectionState =
  | "auto_complete"
  | "needs_input"
  | "ai_draft_pending"
  | "approved"
  | "insufficient_data";

export interface CVSectionStatus {
  identity: CVSectionState;
  physical: CVSectionState;
  positions: CVSectionState;
  personal_statement: CVSectionState;
  career_history: CVSectionState;
  performance_data: CVSectionState;
  trajectory: CVSectionState;
  coachability: CVSectionState;
  competitions: CVSectionState;
  academic: CVSectionState;
  dual_role: CVSectionState;
  video_media: CVSectionState;
  references: CVSectionState;
  character_traits: CVSectionState;
}

export interface CVShareInfo {
  share_token_club: string | null;
  share_token_uni: string | null;
  share_club_views: number;
  share_uni_views: number;
  cv_club_discoverable: boolean;
  cv_uni_discoverable: boolean;
}

export interface FullCVBundle {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  statements: CVStatements;
  trajectory: CVTrajectory;
  dual_role: CVDualRoleCompetency;
  performance: CVPerformanceData;
  competitions: CVCompetitionEntry[];
  injury_status: CVInjuryStatus;
  career: CVCareerEntry[];
  academic: CVAcademicEntry[];
  media: CVMediaLink[];
  references: CVReference[];
  character_traits: CVCharacterTrait[];
  completeness: CVCompletenessResult;
  section_states: CVSectionStatus;
  share: CVShareInfo;
  last_updated: string;
}

// ── Hook ──

interface UseCVProfileReturn {
  data: FullCVBundle | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  // CV profile updates
  updateProfile: (updates: Record<string, unknown>) => Promise<boolean>;
  // Career CRUD
  addCareer: (input: Omit<CVCareerEntry, 'id'>) => Promise<CVCareerEntry | null>;
  updateCareer: (id: string, input: Partial<CVCareerEntry>) => Promise<boolean>;
  deleteCareer: (id: string) => Promise<boolean>;
  // Academic CRUD
  addAcademic: (input: Omit<CVAcademicEntry, 'id'>) => Promise<CVAcademicEntry | null>;
  deleteAcademic: (id: string) => Promise<boolean>;
  // Media CRUD
  addMedia: (input: Omit<CVMediaLink, 'id'>) => Promise<CVMediaLink | null>;
  deleteMedia: (id: string) => Promise<boolean>;
  // Reference CRUD
  addReference: (input: Omit<CVReference, 'id'>) => Promise<CVReference | null>;
  deleteReference: (id: string) => Promise<boolean>;
  // Character trait CRUD
  addTrait: (input: Omit<CVCharacterTrait, 'id'>) => Promise<CVCharacterTrait | null>;
  deleteTrait: (id: string) => Promise<boolean>;
}

export function useCVProfile(athleteId: string): UseCVProfileReturn {
  const [data, setData] = useState<FullCVBundle | null>(null);
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
      const bundle: FullCVBundle = await res.json();
      setData(bundle);
    } catch (err) {
      setError(String(err));
    }
    setIsLoading(false);
  }, [athleteId]);

  useEffect(() => {
    if (athleteId) fetchBundle();
  }, [athleteId, fetchBundle]);

  // ── Profile updates ──
  const updateProfile = useCallback(async (updates: Record<string, unknown>): Promise<boolean> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/profile`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return false;
      await fetchBundle(); // Refetch to get updated data
      return true;
    } catch { return false; }
  }, [fetchBundle]);

  // ── Generic CRUD helper ──
  const crudAdd = useCallback(async <T>(
    endpoint: string,
    input: Record<string, unknown>,
    updateFn: (prev: FullCVBundle, item: T) => FullCVBundle
  ): Promise<T | null> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/${endpoint}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const item = await res.json() as T;
      setData(prev => prev ? updateFn(prev, item) : prev);
      return item;
    } catch { return null; }
  }, []);

  const crudDelete = useCallback(async (
    endpoint: string,
    id: string,
    updateFn: (prev: FullCVBundle) => FullCVBundle
  ): Promise<boolean> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/${endpoint}/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) return false;
      setData(prev => prev ? updateFn(prev) : prev);
      return true;
    } catch { return false; }
  }, []);

  const crudUpdate = useCallback(async (
    endpoint: string,
    id: string,
    input: Record<string, unknown>
  ): Promise<boolean> => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/${endpoint}/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return false;
      await fetchBundle();
      return true;
    } catch { return false; }
  }, [fetchBundle]);

  // ── Career ──
  const addCareer = useCallback((input: Omit<CVCareerEntry, 'id'>) =>
    crudAdd<CVCareerEntry>('career', input as any, (prev, item) => ({
      ...prev, career: [item, ...prev.career]
    })), [crudAdd]);

  const updateCareer = useCallback((id: string, input: Partial<CVCareerEntry>) =>
    crudUpdate('career', id, input as any), [crudUpdate]);

  const deleteCareer = useCallback((id: string) =>
    crudDelete('career', id, prev => ({
      ...prev, career: prev.career.filter(c => c.id !== id)
    })), [crudDelete]);

  // ── Academic ──
  const addAcademic = useCallback((input: Omit<CVAcademicEntry, 'id'>) =>
    crudAdd<CVAcademicEntry>('academic', input as any, (prev, item) => ({
      ...prev, academic: [item, ...prev.academic]
    })), [crudAdd]);

  const deleteAcademic = useCallback((id: string) =>
    crudDelete('academic', id, prev => ({
      ...prev, academic: prev.academic.filter(a => a.id !== id)
    })), [crudDelete]);

  // ── Media ──
  const addMedia = useCallback((input: Omit<CVMediaLink, 'id'>) =>
    crudAdd<CVMediaLink>('media', input as any, (prev, item) => ({
      ...prev, media: [item, ...prev.media]
    })), [crudAdd]);

  const deleteMedia = useCallback((id: string) =>
    crudDelete('media', id, prev => ({
      ...prev, media: prev.media.filter(m => m.id !== id)
    })), [crudDelete]);

  // ── References ──
  const addReference = useCallback((input: Omit<CVReference, 'id'>) =>
    crudAdd<CVReference>('reference', input as any, (prev, item) => ({
      ...prev, references: [item, ...prev.references]
    })), [crudAdd]);

  const deleteReference = useCallback((id: string) =>
    crudDelete('reference', id, prev => ({
      ...prev, references: prev.references.filter(r => r.id !== id)
    })), [crudDelete]);

  // ── Character traits ──
  const addTrait = useCallback((input: Omit<CVCharacterTrait, 'id'>) =>
    crudAdd<CVCharacterTrait>('character', input as any, (prev, item) => ({
      ...prev, character_traits: [item, ...prev.character_traits]
    })), [crudAdd]);

  const deleteTrait = useCallback((id: string) =>
    crudDelete('character', id, prev => ({
      ...prev, character_traits: prev.character_traits.filter(t => t.id !== id)
    })), [crudDelete]);

  return {
    data, isLoading, error,
    refetch: fetchBundle,
    updateProfile,
    addCareer, updateCareer, deleteCareer,
    addAcademic, deleteAcademic,
    addMedia, deleteMedia,
    addReference, deleteReference,
    addTrait, deleteTrait,
  };
}
