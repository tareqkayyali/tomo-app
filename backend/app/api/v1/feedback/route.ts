import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { feedbackSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, completed, actualEffort, notes } = parsed.data;
  const db = supabaseAdmin();

  const { data: plan, error } = await db
    .from("plans")
    .update({
      status: completed ? "completed" : "skipped",
      completed_at: completed ? new Date().toISOString() : null,
      actual_effort: actualEffort || null,
      feedback_notes: notes || null,
    })
    .eq("id", planId)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (error || !plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json(
    { plan },
    { headers: { "api-version": "v1" } }
  );
}
