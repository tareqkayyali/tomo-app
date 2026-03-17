/**
 * Coach Programme Service — multi-week training cycle management.
 *
 * Handles programme CRUD, drill assignment with progression,
 * and publishing (calendar events + player notifications).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyPlayersOfDrillAssignment } from "./notificationService";

// NOTE: coach_programmes / programme_drills not yet in generated Supabase types.
// After running migration and regenerating types, remove these casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const progDb = () => supabaseAdmin() as any;

// ── Create Programme ─────────────────────────────────────────────

export async function createProgramme(
  coachId: string,
  data: {
    name: string;
    description?: string;
    seasonCycle?: string;
    startDate: string;
    weeks: number;
    targetType?: string;
    targetPositions?: string[];
    targetPlayerIds?: string[];
  }
) {
  const db = progDb();
  const { data: programme, error } = await db
    .from("coach_programmes")
    .insert({
      coach_id: coachId,
      name: data.name,
      description: data.description ?? null,
      season_cycle: data.seasonCycle ?? "in_season",
      start_date: data.startDate,
      weeks: data.weeks,
      status: "draft",
      target_type: data.targetType ?? "all",
      target_positions: data.targetPositions ?? [],
      target_player_ids: data.targetPlayerIds ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create programme: ${error.message}`);
  return mapProgramme(programme);
}

// ── Get Programme with Drills ────────────────────────────────────

export async function getProgrammeWithDrills(
  programmeId: string,
  coachId: string
) {
  const db = progDb();

  const [progRes, drillsRes] = await Promise.all([
    db
      .from("coach_programmes")
      .select("*")
      .eq("id", programmeId)
      .eq("coach_id", coachId)
      .single(),
    db
      .from("programme_drills")
      .select("*, training_drills(name, category, duration_minutes)")
      .eq("programme_id", programmeId)
      .order("week_number")
      .order("day_of_week")
      .order("order_in_day"),
  ]);

  if (progRes.error)
    throw new Error(
      `Programme not found: ${progRes.error.message}`
    );

  return {
    ...mapProgramme(progRes.data),
    drills: (drillsRes.data ?? []).map(mapProgrammeDrill),
  };
}

// ── List Programmes ──────────────────────────────────────────────

export async function listCoachProgrammes(coachId: string) {
  const db = progDb();

  const { data, error } = await db
    .from("coach_programmes")
    .select(
      "id, name, season_cycle, start_date, weeks, status, updated_at"
    )
    .eq("coach_id", coachId)
    .order("updated_at", { ascending: false });

  if (error)
    throw new Error(`Failed to list programmes: ${error.message}`);
  return (data ?? []).map(mapProgramme);
}

// ── Add Drill to Programme ───────────────────────────────────────

export async function addDrillToProgramme(
  programmeId: string,
  coachId: string,
  drill: {
    drillId: string;
    weekNumber: number;
    dayOfWeek: number;
    sets: number;
    reps: string;
    intensity: string;
    restSeconds: number;
    rpeTarget: number;
    durationMin?: number;
    tempoNote?: string;
    coachNotes?: string;
    repeatWeeks: number;
    progression: string;
    isMandatory: boolean;
    orderInDay?: number;
    targetOverride?: string;
    targetPosition?: string;
    targetPlayerIds?: string[];
  }
) {
  const db = progDb();

  // Verify coach owns the programme
  const { data: prog } = await db
    .from("coach_programmes")
    .select("id")
    .eq("id", programmeId)
    .eq("coach_id", coachId)
    .single();
  if (!prog) throw new Error("Programme not found or unauthorized");

  // Create one row per repeat week with optional progression
  const rows = Array.from({ length: drill.repeatWeeks }, (_, w) => {
    let sets = drill.sets;
    let reps = drill.reps;
    if (w > 0) {
      if (drill.progression === "sets_plus1") sets = drill.sets + w;
      if (drill.progression === "reps_plus1")
        reps = String(parseInt(drill.reps) + w);
    }
    return {
      programme_id: programmeId,
      drill_id: drill.drillId,
      week_number: drill.weekNumber + w,
      day_of_week: drill.dayOfWeek,
      sets,
      reps,
      intensity: drill.intensity,
      rest_seconds: drill.restSeconds,
      rpe_target: drill.rpeTarget,
      duration_min: drill.durationMin ?? null,
      tempo_note: drill.tempoNote ?? null,
      coach_notes: drill.coachNotes ?? null,
      repeat_weeks: 1,
      progression: drill.progression,
      is_mandatory: drill.isMandatory,
      order_in_day: drill.orderInDay ?? 0,
      target_override: drill.targetOverride ?? "programme",
      target_position: drill.targetPosition ?? null,
      target_player_ids: drill.targetPlayerIds ?? [],
    };
  });

  const { data, error } = await db
    .from("programme_drills")
    .insert(rows)
    .select();
  if (error)
    throw new Error(`Failed to add drill: ${error.message}`);
  return data;
}

// ── Update Programme Drill ───────────────────────────────────────

export async function updateProgrammeDrill(
  drillRecordId: string,
  coachId: string,
  updates: Record<string, any>
) {
  const db = progDb();

  const snake: Record<string, any> = {};
  if (updates.sets !== undefined) snake.sets = updates.sets;
  if (updates.reps !== undefined) snake.reps = updates.reps;
  if (updates.intensity !== undefined) snake.intensity = updates.intensity;
  if (updates.restSeconds !== undefined)
    snake.rest_seconds = updates.restSeconds;
  if (updates.rpeTarget !== undefined)
    snake.rpe_target = updates.rpeTarget;
  if (updates.durationMin !== undefined)
    snake.duration_min = updates.durationMin;
  if (updates.coachNotes !== undefined)
    snake.coach_notes = updates.coachNotes;
  if (updates.isMandatory !== undefined)
    snake.is_mandatory = updates.isMandatory;

  // Verify ownership via programme
  const { data: drillRow } = await db
    .from("programme_drills")
    .select("programme_id")
    .eq("id", drillRecordId)
    .single();

  if (!drillRow)
    throw new Error("Drill record not found");

  const { data: prog } = await db
    .from("coach_programmes")
    .select("id")
    .eq("id", drillRow.programme_id)
    .eq("coach_id", coachId)
    .single();

  if (!prog) throw new Error("Unauthorized");

  const { error } = await db
    .from("programme_drills")
    .update(snake)
    .eq("id", drillRecordId);
  if (error) throw new Error(`Failed to update drill: ${error.message}`);
}

// ── Delete Programme Drill ───────────────────────────────────────

export async function deleteProgrammeDrill(
  drillRecordId: string,
  coachId: string
) {
  const db = progDb();

  // Verify ownership
  const { data: drillRow } = await db
    .from("programme_drills")
    .select("programme_id")
    .eq("id", drillRecordId)
    .single();

  if (!drillRow)
    throw new Error("Drill record not found");

  const { data: prog } = await db
    .from("coach_programmes")
    .select("id")
    .eq("id", drillRow.programme_id)
    .eq("coach_id", coachId)
    .single();

  if (!prog) throw new Error("Unauthorized");

  const { error } = await db
    .from("programme_drills")
    .delete()
    .eq("id", drillRecordId);
  if (error)
    throw new Error(`Failed to delete drill: ${error.message}`);
}

// ── Publish Programme ────────────────────────────────────────────

export async function publishProgramme(
  programmeId: string,
  coachId: string
): Promise<{
  eventsCreated: number;
  playersTargeted: number;
  notificationsSent: number;
}> {
  const db = progDb();

  // 1. Get programme with drills
  const prog = await getProgrammeWithDrills(programmeId, coachId);

  // 2. Get coach name for notifications
  const { data: coach } = await db
    .from("users")
    .select("name")
    .eq("id", coachId)
    .single();
  const coachName = coach?.name ?? "Your coach";

  // 3. Get target players
  const targetPlayers = await getTargetPlayers(prog, coachId);
  if (targetPlayers.length === 0)
    throw new Error("No target players found");

  const startDate = new Date(prog.startDate);
  const calendarInserts: any[] = [];

  // playerDrillMap: key = playerId → drills for notification
  const playerDrillMap: Record<string, { drills: any[] }> = {};
  for (const p of targetPlayers) {
    playerDrillMap[p.id] = { drills: [] };
  }

  // 4. For each programme drill × each player → calendar event + notification data
  for (const drill of prog.drills ?? []) {
    // Calculate actual date
    const weekOffset = (drill.weekNumber - 1) * 7;
    const weekStart = new Date(
      startDate.getTime() + weekOffset * 86400000
    );
    const startDayOfWeek = weekStart.getDay();
    const dayOffset =
      (drill.dayOfWeek - startDayOfWeek + 7) % 7;
    const drillDate = new Date(
      weekStart.getTime() + dayOffset * 86400000
    );
    const dateStr = drillDate.toISOString().split("T")[0];

    for (const player of targetPlayers) {
      calendarInserts.push({
        user_id: player.id,
        name: drill.drillName ?? "Training Session",
        type: "training",
        date: dateStr,
        start_time: null,
        end_time: null,
        intensity: drill.rpeTarget ?? 7,
        notes: drill.coachNotes ?? null,
        source: "coach",
      });

      playerDrillMap[player.id].drills.push({
        drillId: drill.drillId,
        drillName: drill.drillName ?? drill.drillId,
        drillCategory: drill.drillCategory ?? "",
        sets: drill.sets,
        reps: drill.reps,
        intensity: drill.intensity,
        restSeconds: drill.restSeconds,
        rpeTarget: drill.rpeTarget,
        durationMin: drill.durationMin,
        coachNotes: drill.coachNotes,
        isMandatory: drill.isMandatory,
        scheduledDate: dateStr,
        dayOfWeek: drill.dayOfWeek,
      });
    }
  }

  // 5. Batch insert calendar events
  let eventsCreated = 0;
  const batchSize = 100;
  for (let i = 0; i < calendarInserts.length; i += batchSize) {
    const batch = calendarInserts.slice(i, i + batchSize);
    const { data: inserted } = await db
      .from("calendar_events")
      .insert(batch)
      .select("id");
    eventsCreated += inserted?.length ?? 0;
  }

  // 6. Send notifications (DB + push) — grouped per player
  await notifyPlayersOfDrillAssignment({
    programmeId,
    programmeName: prog.name,
    coachId,
    coachName,
    playerDrillMap,
  });

  // 7. Update programme status
  await db
    .from("coach_programmes")
    .update({
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", programmeId)
    .eq("coach_id", coachId);

  return {
    eventsCreated,
    playersTargeted: targetPlayers.length,
    notificationsSent: targetPlayers.length,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function getTargetPlayers(
  programme: any,
  coachId: string
): Promise<{ id: string }[]> {
  const db = progDb();

  // Individual targeting
  if (
    programme.targetType === "individual" &&
    programme.targetPlayerIds?.length > 0
  ) {
    return programme.targetPlayerIds.map((id: string) => ({ id }));
  }

  // Get all linked players via relationships table
  const { data: rels } = await db
    .from("relationships")
    .select("player_id")
    .eq("guardian_id", coachId)
    .eq("relationship_type", "coach")
    .eq("status", "accepted");

  const playerIds = (rels ?? []).map((r: any) => r.player_id);

  // Position group targeting
  if (
    programme.targetType === "position_group" &&
    programme.targetPositions?.length > 0
  ) {
    const { data: players } = await db
      .from("users")
      .select("id")
      .in("id", playerIds)
      .in("position", programme.targetPositions);
    return (players ?? []).map((p: any) => ({ id: p.id }));
  }

  // All players
  return playerIds.map((id: string) => ({ id }));
}

function mapProgramme(data: any): any {
  return {
    id: data.id,
    coachId: data.coach_id,
    name: data.name,
    description: data.description,
    seasonCycle: data.season_cycle,
    startDate: data.start_date,
    weeks: data.weeks,
    status: data.status,
    targetType: data.target_type,
    targetPositions: data.target_positions ?? [],
    targetPlayerIds: data.target_player_ids ?? [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapProgrammeDrill(data: any): any {
  const d = data.training_drills ?? {};
  return {
    id: data.id,
    programmeId: data.programme_id,
    drillId: data.drill_id,
    drillName: d.name ?? data.drill_id,
    drillCategory: d.category,
    weekNumber: data.week_number,
    dayOfWeek: data.day_of_week,
    sets: data.sets,
    reps: data.reps,
    intensity: data.intensity,
    restSeconds: data.rest_seconds,
    rpeTarget: data.rpe_target,
    durationMin: data.duration_min,
    tempoNote: data.tempo_note,
    coachNotes: data.coach_notes,
    repeatWeeks: data.repeat_weeks,
    progression: data.progression,
    isMandatory: data.is_mandatory,
    orderInDay: data.order_in_day,
  };
}
