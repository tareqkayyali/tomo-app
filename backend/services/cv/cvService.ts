/**
 * CV Service — Assembles full player CV data from multiple sources.
 * Uses cv_career_entries table (migration 024).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

// ── Types ──

export interface CareerEntry {
  id: string;
  athlete_id: string;
  entry_type: 'club' | 'academy' | 'national_team' | 'trial' | 'camp' | 'showcase';
  club_name: string;
  league_level: string | null;
  country: string | null;
  position: string | null;
  started_month: string | null;   // 'YYYY-MM'
  ended_month: string | null;     // null if current
  is_current: boolean;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  clean_sheets: number | null;
  achievements: string[];
  injury_note: string | null;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use CareerEntry instead */
export type ClubEntry = CareerEntry;

export interface CompetitionEntry {
  id: string;
  event_type: string;
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

export interface CVBundle {
  snapshot: Record<string, unknown> | null;
  clubs: CareerEntry[];
  competitions: CompetitionEntry[];
}

// ── CV Profile Bundle ──

export async function getCVBundle(athleteId: string): Promise<CVBundle> {
  const [snapshotRes, clubsRes, competitionsRes] = await Promise.all([
    (db() as any)
      .from("athlete_snapshots")
      .select("*")
      .eq("athlete_id", athleteId)
      .single(),
    (db() as any)
      .from("cv_career_entries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("display_order", { ascending: true }),
    (db() as any)
      .from("athlete_events")
      .select("id, event_type, payload, created_at")
      .eq("athlete_id", athleteId)
      .eq("event_type", "COMPETITION_RESULT")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    snapshot: snapshotRes.data ?? null,
    clubs: clubsRes.data ?? [],
    competitions: competitionsRes.data ?? [],
  };
}

// ── Career Entry CRUD ──

export async function listClubs(athleteId: string): Promise<CareerEntry[]> {
  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createClub(input: {
  athlete_id: string;
  club_name: string;
  entry_type?: string;
  league_level?: string;
  country?: string;
  position?: string;
  started_month?: string;
  ended_month?: string | null;
  is_current?: boolean;
  appearances?: number;
  goals?: number;
  assists?: number;
  clean_sheets?: number;
  achievements?: string[];
  injury_note?: string;
}): Promise<CareerEntry> {
  // If marking as current, unset any existing current entries
  if (input.is_current) {
    await (db() as any)
      .from("cv_career_entries")
      .update({ is_current: false })
      .eq("athlete_id", input.athlete_id)
      .eq("is_current", true);
  }

  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .insert({
      athlete_id: input.athlete_id,
      club_name: input.club_name,
      entry_type: input.entry_type ?? "club",
      league_level: input.league_level ?? null,
      country: input.country ?? null,
      position: input.position ?? null,
      started_month: input.started_month ?? null,
      ended_month: input.ended_month ?? null,
      is_current: input.is_current ?? false,
      appearances: input.appearances ?? null,
      goals: input.goals ?? null,
      assists: input.assists ?? null,
      clean_sheets: input.clean_sheets ?? null,
      achievements: input.achievements ?? [],
      injury_note: input.injury_note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClub(
  id: string,
  athleteId: string,
  input: Partial<{
    club_name: string;
    entry_type: string;
    league_level: string;
    country: string;
    position: string;
    started_month: string;
    ended_month: string | null;
    is_current: boolean;
    appearances: number;
    goals: number;
    assists: number;
    clean_sheets: number;
    achievements: string[];
    injury_note: string;
  }>
): Promise<CareerEntry> {
  // If marking as current, unset any existing current entries
  if (input.is_current) {
    await (db() as any)
      .from("cv_career_entries")
      .update({ is_current: false })
      .eq("athlete_id", athleteId)
      .eq("is_current", true)
      .neq("id", id);
  }

  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .update(input)
    .eq("id", id)
    .eq("athlete_id", athleteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClub(id: string, athleteId: string): Promise<void> {
  const { error } = await (db() as any)
    .from("cv_career_entries")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// ── Competition Results ──

export async function getCompetitions(athleteId: string): Promise<CompetitionEntry[]> {
  const { data, error } = await (db() as any)
    .from("athlete_events")
    .select("id, event_type, payload, created_at")
    .eq("athlete_id", athleteId)
    .eq("event_type", "COMPETITION_RESULT")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
