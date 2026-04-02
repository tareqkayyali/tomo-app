import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      "entry_type", "club_name", "league_level", "country", "position",
      "started_month", "ended_month", "is_current", "appearances", "goals",
      "assists", "clean_sheets", "achievements", "injury_note", "display_order",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await (db() as any)
      .from("cv_career_entries")
      .update(updates)
      .eq("id", id)
      .eq("athlete_id", auth.user.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to update career entry", detail: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const { error } = await (db() as any)
      .from("cv_career_entries")
      .delete()
      .eq("id", id)
      .eq("athlete_id", auth.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete career entry", detail: String(err) }, { status: 500 });
  }
}
