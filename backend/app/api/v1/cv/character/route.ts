import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const { data, error } = await (db() as any)
      .from("cv_character_traits")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("display_order");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch character traits", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  try {
    const { data, error } = await (db() as any)
      .from("cv_character_traits")
      .insert({
        athlete_id: auth.user.id,
        trait_category: body.trait_category ?? "award",
        title: body.title,
        description: body.description ?? null,
        level: body.level ?? null,
        date: body.date ?? null,
        display_order: body.display_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create character trait", detail: String(err) }, { status: 500 });
  }
}
