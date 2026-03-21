/**
 * CV Service — Assembles full player CV data from multiple sources.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

// ── Types ──

export interface ClubEntry {
  id: string;
  athlete_id: string;
  club_name: string;
  role: string;
  start_year: number;
  end_year: number | null;
  achievements: string[];
  notes: string | null;
  sort_order: number;
}

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
  clubs: ClubEntry[];
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
      .from("player_club_history")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("start_year", { ascending: false }),
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

// ── Club History CRUD ──

export async function listClubs(athleteId: string): Promise<ClubEntry[]> {
  const { data, error } = await (db() as any)
    .from("player_club_history")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("start_year", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createClub(input: {
  athlete_id: string;
  club_name: string;
  role?: string;
  start_year: number;
  end_year?: number | null;
  achievements?: string[];
  notes?: string;
}): Promise<ClubEntry> {
  const { data, error } = await (db() as any)
    .from("player_club_history")
    .insert({
      athlete_id: input.athlete_id,
      club_name: input.club_name,
      role: input.role ?? "player",
      start_year: input.start_year,
      end_year: input.end_year ?? null,
      achievements: input.achievements ?? [],
      notes: input.notes ?? null,
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
    role: string;
    start_year: number;
    end_year: number | null;
    achievements: string[];
    notes: string;
  }>
): Promise<ClubEntry> {
  const { data, error } = await (db() as any)
    .from("player_club_history")
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
    .from("player_club_history")
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
