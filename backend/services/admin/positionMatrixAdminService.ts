/**
 * Position Training Matrix Admin Service.
 *
 * CRUD over `position_training_matrix` (migration 049) — one row per
 * (sport_id, position) pair. Holds GPS / strength / speed targets plus
 * mandatory & recommended training_program IDs consumed by the
 * recommendation engine.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PositionMatrixRow {
  id: string;
  sport_id: string;
  position: string;
  gps_targets: Record<string, unknown>;
  strength_targets: Record<string, unknown>;
  speed_targets: Record<string, unknown>;
  mandatory_programs: string[];
  recommended_programs: string[];
  weekly_structure: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PositionMatrixWriteInput {
  sport_id: string;
  position: string;
  gps_targets?: Record<string, unknown>;
  strength_targets?: Record<string, unknown>;
  speed_targets?: Record<string, unknown>;
  mandatory_programs?: string[];
  recommended_programs?: string[];
  weekly_structure?: Record<string, unknown>;
}

const TABLE = "position_training_matrix";

// supabase-js typing for this table isn't in the generated types yet;
// the `any` escape is localized here so callers keep a strict interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return supabaseAdmin();
}

export async function listMatrixRows(filter?: {
  sport_id?: string;
}): Promise<PositionMatrixRow[]> {
  let query = db()
    .from(TABLE)
    .select(
      "id, sport_id, position, gps_targets, strength_targets, speed_targets, mandatory_programs, recommended_programs, weekly_structure, created_at, updated_at"
    )
    .order("sport_id")
    .order("position");

  if (filter?.sport_id) {
    query = query.eq("sport_id", filter.sport_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PositionMatrixRow[];
}

export async function getMatrixRow(
  id: string
): Promise<PositionMatrixRow | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select(
      "id, sport_id, position, gps_targets, strength_targets, speed_targets, mandatory_programs, recommended_programs, weekly_structure, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PositionMatrixRow | null) ?? null;
}

export async function createMatrixRow(
  input: PositionMatrixWriteInput
): Promise<PositionMatrixRow> {
  const row = {
    sport_id: input.sport_id,
    position: input.position,
    gps_targets: input.gps_targets ?? {},
    strength_targets: input.strength_targets ?? {},
    speed_targets: input.speed_targets ?? {},
    mandatory_programs: input.mandatory_programs ?? [],
    recommended_programs: input.recommended_programs ?? [],
    weekly_structure: input.weekly_structure ?? {},
  };
  const { data, error } = await db()
    .from(TABLE)
    .insert(row)
    .select(
      "id, sport_id, position, gps_targets, strength_targets, speed_targets, mandatory_programs, recommended_programs, weekly_structure, created_at, updated_at"
    )
    .single();
  if (error) throw new Error(error.message);
  return data as PositionMatrixRow;
}

export async function updateMatrixRow(
  id: string,
  input: Partial<PositionMatrixWriteInput>
): Promise<PositionMatrixRow> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.sport_id !== undefined) payload.sport_id = input.sport_id;
  if (input.position !== undefined) payload.position = input.position;
  if (input.gps_targets !== undefined) payload.gps_targets = input.gps_targets;
  if (input.strength_targets !== undefined)
    payload.strength_targets = input.strength_targets;
  if (input.speed_targets !== undefined)
    payload.speed_targets = input.speed_targets;
  if (input.mandatory_programs !== undefined)
    payload.mandatory_programs = input.mandatory_programs;
  if (input.recommended_programs !== undefined)
    payload.recommended_programs = input.recommended_programs;
  if (input.weekly_structure !== undefined)
    payload.weekly_structure = input.weekly_structure;

  const { data, error } = await db()
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select(
      "id, sport_id, position, gps_targets, strength_targets, speed_targets, mandatory_programs, recommended_programs, weekly_structure, created_at, updated_at"
    )
    .single();
  if (error) throw new Error(error.message);
  return data as PositionMatrixRow;
}

export async function deleteMatrixRow(id: string): Promise<void> {
  const { error } = await db().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
