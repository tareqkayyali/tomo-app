import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";

const blazepodSessionSchema = z.object({
  drillType: z.string().min(1).max(200),
  avgReactionMs: z.number().min(0).optional(),
  bestReactionMs: z.number().min(0).optional(),
  totalHits: z.number().int().min(0).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  rawData: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = blazepodSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { drillType, avgReactionMs, bestReactionMs, totalHits, durationSeconds, rawData } =
      parsed.data;

    const db = supabaseAdmin();
    const { data: session, error } = await db
      .from("blazepod_sessions")
      .insert({
        user_id: auth.user.id,
        date: new Date().toISOString().slice(0, 10),
        drill_type: drillType,
        avg_reaction_ms: avgReactionMs || null,
        best_reaction_ms: bestReactionMs || null,
        total_hits: totalHits || null,
        duration_seconds: durationSeconds || null,
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
