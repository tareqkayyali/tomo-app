/**
 * SD Wideners Admin API
 *
 * GET  /api/v1/admin/sd-wideners?sport_id=football
 *   → list all widener rows for a sport
 *
 * PUT  /api/v1/admin/sd-wideners
 *   body: { sport_id, age_band, multiplier, rationale? }
 *   → upsert (one row per sport×age_band by the unique constraint)
 *
 * Requires institutional_pd or super_admin role via enterprise RBAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateWidenerCache } from "@/services/benchmarks/maturity";

const AGE_BAND_VALUES = [
  "U13",
  "U15",
  "U17",
  "U19",
  "SEN",
  "SEN30",
  "VET",
] as const;

const listFilterSchema = z.object({
  sport_id: z.string().min(1).max(64),
});

const upsertSchema = z.object({
  sport_id: z.string().min(1).max(64),
  age_band: z.enum(AGE_BAND_VALUES),
  multiplier: z.coerce
    .number()
    .min(0.5, "Widener too narrow — check < 0.5 blocked by DB constraint")
    .max(3.0, "Widener too wide — check > 3.0 blocked by DB constraint"),
  rationale: z.string().max(2000).optional().nullable(),
});

// ── GET ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listFilterSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin() as any)
      .from("sport_sd_wideners")
      .select("id, sport_id, age_band, multiplier, rationale, updated_at")
      .eq("sport_id", parsed.data.sport_id)
      .order("age_band", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to list wideners", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list wideners", detail: String(err) },
      { status: 500 }
    );
  }
}

// ── PUT (upsert) ────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin() as any)
      .from("sport_sd_wideners")
      .upsert(
        {
          sport_id: parsed.data.sport_id,
          age_band: parsed.data.age_band,
          multiplier: parsed.data.multiplier,
          rationale: parsed.data.rationale ?? null,
          updated_by: auth.user.id,
        },
        { onConflict: "sport_id,age_band" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to upsert widener", detail: error.message },
        { status: 500 }
      );
    }

    invalidateWidenerCache();

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to upsert widener", detail: String(err) },
      { status: 500 }
    );
  }
}
