import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, sport, age } = parsed.data;
  const db = supabaseAdmin();

  // Check if user profile already exists
  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("id", auth.user.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "User profile already exists" },
      { status: 409 }
    );
  }

  const { data: user, error } = await db
    .from("users")
    .insert({
      id: auth.user.id,
      email: auth.user.email,
      name,
      sport,
      age,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create user profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ user }, { status: 201, headers: { "api-version": "v1" } });
}
