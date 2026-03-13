import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// NOTE: day_locks table type will be available after running the SQL migration
// and regenerating types with `npx supabase gen types typescript --local`.
// Until then, we use `as any` casts on .from() calls.

// ─── GET /api/v1/calendar/day-lock?date=YYYY-MM-DD ────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Provide 'date' query param (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("day_locks")
    .select("locked_at")
    .eq("user_id", auth.user.id)
    .eq("date", date)
    .maybeSingle();

  return NextResponse.json(
    {
      locked: !!data,
      lockedAt: data?.locked_at || null,
    },
    { headers: { "api-version": "v1" } }
  );
}

// ─── POST /api/v1/calendar/day-lock — Lock a day ──────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const date = body?.date;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Provide 'date' in body (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // Upsert — idempotent lock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("day_locks")
      .upsert(
        { user_id: auth.user.id, date },
        { onConflict: "user_id,date" }
      )
      .select("locked_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { locked: true, lockedAt: data.locked_at },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// ─── DELETE /api/v1/calendar/day-lock?date=YYYY-MM-DD — Unlock a day ──────

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Provide 'date' query param (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("day_locks")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("date", date);

  return NextResponse.json(
    { locked: false },
    { headers: { "api-version": "v1" } }
  );
}
