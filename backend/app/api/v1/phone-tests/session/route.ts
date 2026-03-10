import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";

const phoneTestSessionSchema = z.object({
  testType: z.string().min(1).max(200),
  score: z.number().optional(),
  rawData: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = phoneTestSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { testType, score, rawData } = parsed.data;

    const db = supabaseAdmin();
    const { data: session, error } = await db
      .from("phone_test_sessions")
      .insert({
        user_id: auth.user.id,
        date: new Date().toISOString().slice(0, 10),
        test_type: testType,
        score: score || null,
        raw_data: (rawData as unknown as Json) || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { session },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
