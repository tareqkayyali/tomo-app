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
    const allowed = [
      "institution", "country", "qualification", "year_start", "year_end",
      "gpa", "gpa_scale", "predicted_grade", "honours", "ncaa_eligibility_id", "is_current",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await (db() as any)
      .from("cv_academic_entries")
      .update(updates)
      .eq("id", id)
      .eq("athlete_id", auth.user.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to update academic entry", detail: String(err) }, { status: 500 });
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
      .from("cv_academic_entries")
      .delete()
      .eq("id", id)
      .eq("athlete_id", auth.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete academic entry", detail: String(err) }, { status: 500 });
  }
}
