import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { name, date, eventType, startTime, endTime, notes } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: "name and date are required" },
        { status: 400 }
      );
    }

    const startAt = startTime ? `${date}T${startTime}:00` : `${date}T00:00:00`;
    const endAt = endTime ? `${date}T${endTime}:00` : null;

    const db = supabaseAdmin();
    const { data: event, error } = await db
      .from("calendar_events")
      .insert({
        user_id: auth.user.id,
        title: name,
        event_type: eventType || "training",
        start_at: startAt,
        end_at: endAt,
        notes: notes || "Created from ghost suggestion",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { event },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
