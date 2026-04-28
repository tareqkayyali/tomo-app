import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/pd/instructions/athletes-roster
 * Lightweight roster used by the dry-run preview page picker.
 * Returns up to 100 athletes with the scope-relevant fields.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("athlete_snapshots")
      .select("athlete_id, sport, phv_stage, position, athlete_mode, age_band")
      .limit(100);
    if (error) throw error;

    const ids = (data ?? []).map((r: any) => r.athlete_id).filter(Boolean);
    const namesById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users } = await db
        .from("users")
        .select("id, name, display_name")
        .in("id", ids);
      for (const u of users ?? []) {
        const display = (u.display_name as string | null) || (u.name as string | null) || "Athlete";
        namesById.set(u.id as string, display);
      }
    }

    const athletes = (data ?? []).map((r: any) => ({
      id: r.athlete_id as string,
      name: namesById.get(r.athlete_id) ?? "Athlete",
      sport: (r.sport as string | null) ?? null,
      phv_stage: (r.phv_stage as string | null) ?? null,
      position: (r.position as string | null) ?? null,
      mode: (r.athlete_mode as string | null) ?? null,
      age_band: (r.age_band as string | null) ?? null,
    }));

    athletes.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    return NextResponse.json({ athletes });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load roster", detail: String(err) },
      { status: 500 },
    );
  }
}
