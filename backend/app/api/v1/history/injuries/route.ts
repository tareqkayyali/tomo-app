/**
 * Past injury history CRUD for Profile > Historical Data.
 *
 * GET    — list athlete's past injuries (year DESC).
 * POST   — add a past injury.
 * DELETE — remove one by ?id=<uuid>.
 *
 * RLS (migration 077) enforces ownership; the service role client bypasses
 * RLS, so every query also filters by auth.user.id for defence-in-depth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const CURRENT_YEAR = new Date().getUTCFullYear();

const injurySchema = z.object({
  bodyArea: z.string().min(1).max(80),
  severity: z.enum(["minor", "moderate", "severe"]),
  year: z.number().int().min(1990).max(CURRENT_YEAR),
  weeksOut: z.number().int().min(0).max(260).nullable().optional(),
  resolved: z.boolean().default(true),
  note: z.string().max(280).nullable().optional(),
});

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    bodyArea: row.body_area,
    severity: row.severity,
    year: row.year,
    weeksOut: row.weeks_out,
    resolved: row.resolved,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /api/v1/history/injuries ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("athlete_injury_history")
    .select("id, body_area, severity, year, weeks_out, resolved, note, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { injuries: ((data as any[] | null) ?? []).map(serialize) },
    { headers: { "api-version": "v1" } },
  );
}

// ── POST /api/v1/history/injuries ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = injurySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { bodyArea, severity, year, weeksOut, resolved, note } = parsed.data;

  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("athlete_injury_history")
    .insert({
      user_id: auth.user.id,
      body_area: bodyArea,
      severity,
      year,
      weeks_out: weeksOut ?? null,
      resolved,
      note: note ?? null,
    })
    .select("id, body_area, severity, year, weeks_out, resolved, note, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json(
    { injury: serialize(data as Record<string, unknown>) },
    { status: 201, headers: { "api-version": "v1" } },
  );
}

// ── DELETE /api/v1/history/injuries?id=<uuid> ──────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const db = supabaseAdmin() as any;
  const { error } = await db
    .from("athlete_injury_history")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, id }, { headers: { "api-version": "v1" } });
}
