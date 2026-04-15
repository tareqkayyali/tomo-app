/**
 * Canonical Training Programs Seed — Migration 049 companion
 *
 * Idempotent UPSERT of the 31 football programs + 9 position matrices into
 * the new canonical tables introduced by migration 049:
 *   - public.training_programs
 *   - public.position_training_matrix
 *
 * Source of truth: backend/services/programs/footballPrograms.ts
 * (FOOTBALL_PROGRAMS + POSITION_MATRIX exports). This seed just projects
 * those TypeScript constants into the DB — NO catalog duplication.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seeds/seed_training_programs.ts
 *
 * Re-run safely after any catalog edit; UPSERT key is (sport_id, name) on
 * training_programs and (sport_id, position) on position_training_matrix.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { FOOTBALL_PROGRAMS, POSITION_MATRIX } from "../../services/programs/footballPrograms";

// ── Env loading (no dotenv dep) ─────────────────────────────────────────

const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Seed functions ──────────────────────────────────────────────────────

async function seedPrograms() {
  console.log(`\nSeeding ${FOOTBALL_PROGRAMS.length} programs into public.training_programs ...`);

  const rows = FOOTBALL_PROGRAMS.map((p) => ({
    sport_id: "football",
    name: p.name,
    category: p.category,
    type: p.type,
    description: p.description,
    equipment: p.equipment,
    duration_minutes: p.duration_minutes,
    duration_weeks: p.duration_weeks,
    position_emphasis: p.position_emphasis,
    difficulty: p.difficulty,
    tags: p.tags,
    prescriptions: p.prescriptions,
    phv_guidance: p.phv_guidance,
    active: true,
    chat_eligible: true,
    sort_order: 100,
  }));

  // UPSERT by (sport_id, name) — the canonical uniqueness constraint.
  const { data, error } = await supabase
    .from("training_programs")
    .upsert(rows, { onConflict: "sport_id,name" })
    .select("id, name");

  if (error) {
    console.error("Program upsert failed:", error);
    process.exit(1);
  }

  console.log(`  Upserted ${data?.length ?? 0} programs`);
  return data ?? [];
}

async function seedPositionMatrix(programIdsByName: Map<string, string>) {
  console.log(`\nSeeding ${POSITION_MATRIX.length} position matrices into public.position_training_matrix ...`);

  // POSITION_MATRIX in TS references programs by string ID (the TS slug/id).
  // In the DB, programs have uuid IDs — but the TS entries reference programs
  // by the same IDs that exist in FOOTBALL_PROGRAMS[].id. Since those IDs are
  // text slugs (e.g. "sprint_phase1"), we can't just use them as uuids.
  //
  // Strategy: Look up each program name in the TS array, get its uuid from the
  // prior UPSERT result, and store uuids in the matrix rather than slugs. This
  // way position_training_matrix.mandatory_programs and .recommended_programs
  // are arrays of the real training_programs.id values.
  const tsIdToName = new Map(FOOTBALL_PROGRAMS.map((p) => [p.id, p.name]));

  function resolveIds(tsIds: string[]): string[] {
    const uuids: string[] = [];
    for (const tsId of tsIds) {
      const name = tsIdToName.get(tsId);
      if (!name) {
        console.warn(`  WARN: position matrix references unknown program id '${tsId}'`);
        continue;
      }
      const uuid = programIdsByName.get(name);
      if (!uuid) {
        console.warn(`  WARN: program '${name}' not found in upserted rows`);
        continue;
      }
      uuids.push(uuid);
    }
    return uuids;
  }

  const rows = POSITION_MATRIX.map((m) => ({
    sport_id: "football",
    position: m.position,
    gps_targets: m.gps_targets,
    strength_targets: m.strength_targets,
    speed_targets: m.speed_targets,
    mandatory_programs: resolveIds(m.mandatory_programs),
    recommended_programs: resolveIds(m.recommended_programs),
    weekly_structure: m.weekly_structure,
  }));

  const { data, error } = await supabase
    .from("position_training_matrix")
    .upsert(rows, { onConflict: "sport_id,position" })
    .select("id, position");

  if (error) {
    console.error("Position matrix upsert failed:", error);
    process.exit(1);
  }

  console.log(`  Upserted ${data?.length ?? 0} position matrices`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const upserted = await seedPrograms();
  const byName = new Map<string, string>(upserted.map((r: any) => [r.name, r.id]));
  await seedPositionMatrix(byName);
  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
