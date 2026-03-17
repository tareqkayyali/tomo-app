/**
 * GET /api/v1/programs — List/filter training programs
 *
 * Query params:
 *   category — filter by category (sprint, strength, etc.)
 *   type — filter by type (physical, technical)
 *   ageBand — return prescriptions for this age band
 *   position — filter by position emphasis
 *   q — search name/description
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const type = url.searchParams.get("type");
  const position = url.searchParams.get("position");
  const q = url.searchParams.get("q");

  let query = (db as any)
    .from("football_training_programs")
    .select("id, name, category, type, description, equipment, duration_minutes, position_emphasis, difficulty, tags, prescriptions, phv_guidance")
    .order("name");

  if (category) query = query.eq("category", category);
  if (type) query = query.eq("type", type);
  if (position) query = query.contains("position_emphasis", [position]);
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ programs: data ?? [] });
}
