import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { onboardingSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const updates: Record<string, unknown> = {
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.sport) updates.sport = parsed.data.sport;
  if (parsed.data.age) updates.age = parsed.data.age;
  if (parsed.data.schoolHours !== undefined) updates.school_hours = parsed.data.schoolHours;
  if (parsed.data.examPeriods !== undefined) updates.exam_periods = parsed.data.examPeriods;

  const { data: user, error } = await db
    .from("users")
    .update(updates)
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update onboarding" },
      { status: 500 }
    );
  }

  return NextResponse.json({ user }, { headers: { "api-version": "v1" } });
}
