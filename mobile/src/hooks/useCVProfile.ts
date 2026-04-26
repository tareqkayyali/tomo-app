/**
 * useCVProfile — Fetches the full CV bundle (single-flow, 12-screen schema).
 * Plus CRUD helpers for every mutable section.
 */

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "../services/apiConfig";
import { getIdToken } from "../services/auth";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token
    ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
    : { Accept: "application/json" };
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (mirror backend services/cv/cvAssembler.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface CVIdentity {
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  nationality: string | null;
  passport_country: string | null;
  city_country: string | null;
  photo_url: string | null;
  email: string;
  sport: string;
  primary_position: string | null;
  preferred_foot: string | null;
  age_group: string | null;
  phv_stage: string | null;
  phv_offset_years: number | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
}

export interface CVPhysicalProfile {
  height_cm: number | null;
  weight_kg: number | null;
  phv_stage: string | null;
  phv_offset_years: number | null;
}

export interface CVPositions {
  primary_position: string | null;
  primary_label: string | null;
  primary_description: string | null;
  secondary_positions: string[];
  formation_preference: string | null;
  dominant_zone: string | null;
  is_set: boolean;
  has_secondary: boolean;
}

export interface CVBenchmarkRow {
  metric_key: string;
  metric_label: string;
  value: number;
  unit: string;
  percentile: number;
  zone: "elite" | "on_par" | "dev_priority";
  direction: "higher_is_better" | "lower_is_better";
  age_band: string;
  position: string;
  tested_at: string | null;
}

export interface CVKeySignal {
  metric_key: string;
  label: string;
  detail: string;
  percentile_label: string;
  kind: "strength" | "focus";
}

export interface CVSummaryVersion {
  version_number: number;
  generated_at: string;
  approved: boolean;
  approved_at: string | null;
}

export interface CVPlayerProfile {
  ai_summary: string | null;
  ai_summary_status: "draft" | "approved" | "needs_update";
  ai_summary_last_generated: string | null;
  ai_summary_approved_at: string | null;
  key_signals: {
    strengths: CVKeySignal[];
    focus_areas: CVKeySignal[];
    physical_maturity: { label: string; detail: string } | null;
  };
  versions: CVSummaryVersion[];
}

export interface CVSessionLogEntry {
  date: string;
  title: string;
  category: string;
  duration_min: number | null;
  load_au: number | null;
}

export interface CVVerifiedPerformance {
  sessions_total: number;
  training_age_months: number;
  training_age_label: string;
  streak_days: number;
  acwr: number | null;
  training_balance: "under" | "balanced" | "over" | null;
  benchmarks: CVBenchmarkRow[];
  strength_zones: CVBenchmarkRow[];
  development_focus: CVBenchmarkRow[];
  overall_percentile: number | null;
  session_log: CVSessionLogEntry[];
  data_start_date: string | null;
  verified_by: "tomo_platform";
}

export type CareerEntryType =
  | "club"
  | "academy"
  | "national_team"
  | "trial"
  | "camp"
  | "showcase";

export interface CVCareerEntry {
  id: string;
  entry_type: CareerEntryType;
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

export type MediaType = "highlight_reel" | "full_match" | "training" | "social";
export type MediaPlatform =
  | "youtube"
  | "vimeo"
  | "instagram"
  | "tiktok"
  | "wyscout"
  | "hudl"
  | "other";

export interface CVMediaLink {
  id: string;
  media_type: MediaType;
  platform: MediaPlatform | null;
  url: string;
  title: string | null;
  is_primary: boolean;
}

export type ReferenceStatus =
  | "requested"
  | "submitted"
  | "identity_verified"
  | "published"
  | "rejected";

export interface CVReferenceEntry {
  id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  status: ReferenceStatus;
  request_sent_at: string | null;
  submitted_at: string | null;
  submitted_rating: number | null;
  submitted_note: string | null;
  published_at: string | null;
}

export type TraitCategory = "award" | "leadership" | "language" | "character";

export interface CVCharacterTrait {
  id: string;
  trait_category: TraitCategory;
  title: string;
  description: string | null;
  level: string | null;
  date: string | null;
}

export interface CVAwardsCharacter {
  awards: CVCharacterTrait[];
  leadership: CVCharacterTrait[];
  languages: CVCharacterTrait[];
  character: CVCharacterTrait[];
  total_count: number;
}

export type InjurySeverity = "minor" | "moderate" | "major";
export type InjuryStatus = "active" | "recovering" | "cleared";
export type InjurySide = "left" | "right" | "bilateral" | "central";

export interface CVInjuryEntry {
  id: string;
  body_part: string;
  side: InjurySide | null;
  severity: InjurySeverity;
  status: InjuryStatus;
  date_occurred: string;
  cleared_at: string | null;
  notes: string | null;
}

export interface CVHealthStatus {
  overall: "fully_fit" | "returning" | "injured";
  status_label: string;
  status_detail: string;
  updated_at: string;
  availability: {
    match_ready: boolean;
    training_load: "full" | "partial" | "rest";
    restrictions: string[];
    last_screening_date: string | null;
  };
  injury_log: CVInjuryEntry[];
  medical_consent: {
    share_with_coach: boolean;
    share_with_scouts_summary: boolean;
    share_raw_data: boolean;
    signed: boolean;
  };
}

export interface CVShareInfo {
  share_slug: string | null;
  share_views_count: number;
  is_published: boolean;
  public_url: string | null;
  last_pdf_export_at: string | null;
}

export type CVNextStepKey =
  | "secondary_positions"
  | "career_history"
  | "highlight_video"
  | "coach_reference"
  | "awards_character"
  | "approve_ai_summary"
  | "health_screening";

export type CVTargetSection =
  | "playing_positions"
  | "career_history"
  | "video_media"
  | "references"
  | "awards_character"
  | "player_profile"
  | "health_status";

export interface CVNextStep {
  key: CVNextStepKey;
  title: string;
  subtitle: string;
  category: string;
  impact_pct: number;
  estimated_minutes: number;
  target_section: CVTargetSection;
}

export type CVSectionState =
  | "auto_complete"
  | "needs_input"
  | "ai_draft_pending"
  | "approved"
  | "insufficient_data"
  | "empty";

export interface CVSectionStatus {
  identity: CVSectionState;
  player_profile: CVSectionState;
  physical_profile: CVSectionState;
  playing_positions: CVSectionState;
  verified_performance: CVSectionState;
  career_history: CVSectionState;
  video_media: CVSectionState;
  references: CVSectionState;
  awards_character: CVSectionState;
  health_status: CVSectionState;
}

export interface CVCompletenessBreakdownRow {
  score: number;
  max: number;
  label: string;
}

export interface FullCVBundle {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  player_profile: CVPlayerProfile;
  verified_performance: CVVerifiedPerformance;
  career: CVCareerEntry[];
  media: CVMediaLink[];
  references: CVReferenceEntry[];
  awards_character: CVAwardsCharacter;
  health_status: CVHealthStatus;
  completeness_pct: number;
  completeness_breakdown: Record<string, CVCompletenessBreakdownRow>;
  next_steps: CVNextStep[];
  section_states: CVSectionStatus;
  share: CVShareInfo;
  last_updated: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

interface UseCVProfileReturn {
  data: FullCVBundle | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  // Profile
  updateProfile: (updates: Partial<{
    formation_preference: string | null;
    dominant_zone: string | null;
    show_performance_data: boolean;
    show_coachability: boolean;
  }>) => Promise<boolean>;

  // AI summary
  regenerateAISummary: (force?: boolean) => Promise<{ generated: boolean; content: string | null }>;
  approveAISummary: () => Promise<boolean>;

  // Career
  addCareer: (input: Omit<CVCareerEntry, "id">) => Promise<CVCareerEntry | null>;
  updateCareer: (id: string, patch: Partial<CVCareerEntry>) => Promise<boolean>;
  deleteCareer: (id: string) => Promise<boolean>;

  // Media
  addMedia: (input: Omit<CVMediaLink, "id">) => Promise<CVMediaLink | null>;
  deleteMedia: (id: string) => Promise<boolean>;

  // References
  requestReference: (input: {
    referee_name: string;
    referee_role: string;
    club_institution: string;
    email: string;
    phone?: string | null;
    relationship?: string | null;
  }) => Promise<{ reference: CVReferenceEntry; referee_link: string } | null>;
  deleteReference: (id: string) => Promise<boolean>;

  // Awards & Character
  addTrait: (input: Omit<CVCharacterTrait, "id">) => Promise<CVCharacterTrait | null>;
  deleteTrait: (id: string) => Promise<boolean>;

  // Health
  addInjury: (input: Omit<CVInjuryEntry, "id">) => Promise<CVInjuryEntry | null>;
  updateInjury: (id: string, patch: Partial<CVInjuryEntry>) => Promise<boolean>;
  deleteInjury: (id: string) => Promise<boolean>;
  updateMedicalConsent: (patch: Partial<{
    share_with_coach: boolean;
    share_with_scouts_summary: boolean;
    share_raw_data: boolean;
    last_screening_date: string | null;
  }>) => Promise<boolean>;

  // Publish
  publish: () => Promise<{ slug: string; public_url: string } | null>;
  unpublish: () => Promise<boolean>;
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
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body?.detail ?? body?.error ?? "";
        } catch {
          try { detail = await res.text(); } catch { /* ignore */ }
        }
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
      }
      const bundle: FullCVBundle = await res.json();
      setData(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setIsLoading(false);
  }, [athleteId]);

  useEffect(() => {
    if (athleteId) fetchBundle();
  }, [athleteId, fetchBundle]);

  // ── Helpers ──

  const apiCall = useCallback(
    async (
      path: string,
      init: RequestInit & { parse?: boolean } = {}
    ): Promise<Response> => {
      const headers = await authHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      });
    },
    []
  );

  // ── Profile ──

  const updateProfile = useCallback(
    async (updates: Parameters<UseCVProfileReturn['updateProfile']>[0]): Promise<boolean> => {
      try {
        const res = await apiCall("/api/v1/cv/profile", {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        if (!res.ok) return false;
        await fetchBundle();
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, fetchBundle]
  );

  // ── AI summary ──

  const regenerateAISummary = useCallback(
    async (force = false) => {
      try {
        const res = await apiCall("/api/v1/cv/ai-summary/regenerate", {
          method: "POST",
          body: JSON.stringify({ force }),
        });
        if (!res.ok) return { generated: false, content: null };
        const body = await res.json();
        await fetchBundle();
        return { generated: !!body.generated, content: body.content ?? null };
      } catch {
        return { generated: false, content: null };
      }
    },
    [apiCall, fetchBundle]
  );

  const approveAISummary = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiCall("/api/v1/cv/ai-summary/approve", { method: "POST" });
      if (!res.ok) return false;
      await fetchBundle();
      return true;
    } catch {
      return false;
    }
  }, [apiCall, fetchBundle]);

  // ── Generic CRUD helpers (narrow refetch) ──

  const addEntity = useCallback(
    async <T>(path: string, payload: unknown): Promise<T | null> => {
      try {
        const res = await apiCall(path, { method: "POST", body: JSON.stringify(payload) });
        if (!res.ok) return null;
        const row = (await res.json()) as T;
        await fetchBundle();
        return row;
      } catch {
        return null;
      }
    },
    [apiCall, fetchBundle]
  );

  const patchEntity = useCallback(
    async (path: string, payload: unknown): Promise<boolean> => {
      try {
        const res = await apiCall(path, { method: "PATCH", body: JSON.stringify(payload) });
        if (!res.ok) return false;
        await fetchBundle();
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, fetchBundle]
  );

  const putEntity = useCallback(
    async (path: string, payload: unknown): Promise<boolean> => {
      try {
        const res = await apiCall(path, { method: "PUT", body: JSON.stringify(payload) });
        if (!res.ok) return false;
        await fetchBundle();
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, fetchBundle]
  );

  const deleteEntity = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        const res = await apiCall(path, { method: "DELETE" });
        if (!res.ok) return false;
        await fetchBundle();
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, fetchBundle]
  );

  // ── Career ──

  const addCareer = useCallback(
    (input: Omit<CVCareerEntry, "id">) =>
      addEntity<CVCareerEntry>("/api/v1/cv/career", input),
    [addEntity]
  );
  const updateCareer = useCallback(
    (id: string, patch: Partial<CVCareerEntry>) =>
      putEntity(`/api/v1/cv/career/${id}`, patch),
    [putEntity]
  );
  const deleteCareer = useCallback(
    (id: string) => deleteEntity(`/api/v1/cv/career/${id}`),
    [deleteEntity]
  );

  // ── Media ──

  const addMedia = useCallback(
    (input: Omit<CVMediaLink, "id">) =>
      addEntity<CVMediaLink>("/api/v1/cv/media", input),
    [addEntity]
  );
  const deleteMedia = useCallback(
    (id: string) => deleteEntity(`/api/v1/cv/media/${id}`),
    [deleteEntity]
  );

  // ── References ──

  const requestReference = useCallback(
    async (input: Parameters<UseCVProfileReturn['requestReference']>[0]) => {
      try {
        const res = await apiCall("/api/v1/cv/reference", {
          method: "POST",
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const body = await res.json();
        await fetchBundle();
        return { reference: body.reference, referee_link: body.referee_link };
      } catch {
        return null;
      }
    },
    [apiCall, fetchBundle]
  );
  const deleteReference = useCallback(
    (id: string) => deleteEntity(`/api/v1/cv/reference/${id}`),
    [deleteEntity]
  );

  // ── Awards & Character ──

  const addTrait = useCallback(
    (input: Omit<CVCharacterTrait, "id">) =>
      addEntity<CVCharacterTrait>("/api/v1/cv/character", input),
    [addEntity]
  );
  const deleteTrait = useCallback(
    (id: string) => deleteEntity(`/api/v1/cv/character/${id}`),
    [deleteEntity]
  );

  // ── Health ──

  const addInjury = useCallback(
    (input: Omit<CVInjuryEntry, "id">) =>
      addEntity<CVInjuryEntry>("/api/v1/cv/injury", input),
    [addEntity]
  );
  const updateInjury = useCallback(
    (id: string, patch: Partial<CVInjuryEntry>) =>
      patchEntity(`/api/v1/cv/injury/${id}`, patch),
    [patchEntity]
  );
  const deleteInjury = useCallback(
    (id: string) => deleteEntity(`/api/v1/cv/injury/${id}`),
    [deleteEntity]
  );
  const updateMedicalConsent = useCallback(
    async (patch: Parameters<UseCVProfileReturn['updateMedicalConsent']>[0]): Promise<boolean> => {
      try {
        const res = await apiCall("/api/v1/cv/medical-consent", {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        if (!res.ok) return false;
        await fetchBundle();
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, fetchBundle]
  );

  // ── Publish ──

  const publish = useCallback(async () => {
    try {
      const res = await apiCall("/api/v1/cv/publish", { method: "POST" });
      if (!res.ok) return null;
      const body = await res.json();
      await fetchBundle();
      return { slug: body.slug, public_url: body.public_url };
    } catch {
      return null;
    }
  }, [apiCall, fetchBundle]);

  const unpublish = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiCall("/api/v1/cv/publish", { method: "DELETE" });
      if (!res.ok) return false;
      await fetchBundle();
      return true;
    } catch {
      return false;
    }
  }, [apiCall, fetchBundle]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchBundle,
    updateProfile,
    regenerateAISummary,
    approveAISummary,
    addCareer,
    updateCareer,
    deleteCareer,
    addMedia,
    deleteMedia,
    requestReference,
    deleteReference,
    addTrait,
    deleteTrait,
    addInjury,
    updateInjury,
    deleteInjury,
    updateMedicalConsent,
    publish,
    unpublish,
  };
}
