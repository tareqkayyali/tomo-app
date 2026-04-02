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
      "referee_name", "referee_role", "club_institution",
      "email", "phone", "relationship", "consent_given", "display_order",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await (db() as any)
      .from("cv_references")
      .update(updates)
      .eq("id", id)
      .eq("athlete_id", auth.user.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to update reference", detail: String(err) }, { status: 500 });
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
      .from("cv_references")
      .delete()
      .eq("id", id)
      .eq("athlete_id", auth.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete reference", detail: String(err) }, { status: 500 });
  }
}
