import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const days = Math.min(parseInt(searchParams.get("days") || "14", 10), 90);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const db = supabaseAdmin();
  const { data: sleepLogs, error } = await db
    .from("sleep_logs")
    .select("*")
    .eq("user_id", auth.user.id)
    .gte("date", startDateStr)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { sleepLogs: sleepLogs || [], count: sleepLogs?.length || 0 },
    { headers: { "api-version": "v1" } }
  );
}
