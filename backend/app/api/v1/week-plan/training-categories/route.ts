/**
 * POST /api/v1/week-plan/training-categories
 *
 * Append a new training category to the athlete's My Rules
 * (`player_schedule_preferences.training_categories` JSONB array).
 * Powered by the inline "Add category" affordance on the Training Mix
 * capsule, mirroring the StudyPlanCapsule → /api/v1/week-plan/subjects
 * pattern.
 *
 * Canonical shape is an ARRAY of entries (see migration 010 default,
 * intentHandlers.ts, timelineAgent.ts). The buildBaselineTrainingMix
 * reader treats array-shaped JSONB as the source of truth — the Training
 * Mix capsule picks the new category up on the next /suggest call.
 *
 * Why append-only (not PATCH the whole array)? Mobile does not ship the
 * full list — we want to avoid racing a My Rules edit that might be
 * in-flight from Settings. Server-side read-modify-write with a
 * conservative dedupe keeps things consistent.
 *
 * Why not /api/v1/schedule/rules PATCH? That route requires SUPABASE_DB_URL
 * (directQuery) which is not guaranteed set in every env — the same
 * SUPABASE_DB_URL-is-not-set failure that forced /week-plan/subjects into
 * its own route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const PREFERRED_TIMES = ["morning", "afternoon", "evening"] as const;

const bodySchema = z.object({
  label: z.string().min(1).max(40),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  daysPerWeek: z.number().int().min(0).max(7).optional(),
  sessionDuration: z.number().int().min(5).max(240).optional(),
  preferredTime: z.enum(PREFERRED_TIMES).optional(),
  mode: z.enum(["fixed_days", "days_per_week"]).optional(),
  fixedDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "custom";
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const userId = auth.user.id;

  const { data: row, error: readErr } = await (db as any)
    .from("player_schedule_preferences")
    .select("training_categories")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: "Failed to load rules", detail: readErr.message },
      { status: 500 },
    );
  }

  const existing: any[] = Array.isArray(row?.training_categories)
    ? row!.training_categories
    : [];

  const label = body.label.trim();
  const baseId = slugify(label);
  const existingIds = new Set(
    existing.map((c) => (typeof c?.id === "string" ? c.id : "")).filter(Boolean),
  );
  const existingLabels = new Set(
    existing
      .map((c) => (typeof c?.label === "string" ? c.label.trim().toLowerCase() : ""))
      .filter(Boolean),
  );

  // Dedupe by label first — if the athlete already has a category with
  // the same display name (case-insensitive), enable it rather than
  // creating a stealth duplicate with a different id.
  if (existingLabels.has(label.toLowerCase())) {
    const updated = existing.map((c) =>
      typeof c?.label === "string" && c.label.trim().toLowerCase() === label.toLowerCase()
        ? { ...c, enabled: true }
        : c,
    );
    const { error: upErr } = await (db as any)
      .from("player_schedule_preferences")
      .upsert(
        {
          user_id: userId,
          training_categories: updated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upErr) {
      return NextResponse.json(
        { error: "Failed to update rules", detail: upErr.message },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      action: "enabled_existing",
      training_categories: updated,
    });
  }

  // Unique id — suffix with a counter or timestamp if slug collides.
  let newId = baseId;
  if (existingIds.has(newId)) {
    newId = `${baseId}_${Date.now().toString(36)}`;
  }

  const entry = {
    id: newId,
    label,
    icon: body.icon ?? "barbell-outline",
    color: body.color ?? "#7DB04F",
    enabled: true,
    mode: body.mode ?? (body.fixedDays && body.fixedDays.length > 0 ? "fixed_days" : "days_per_week"),
    fixedDays: body.fixedDays ?? [],
    daysPerWeek: body.daysPerWeek ?? 2,
    sessionDuration: body.sessionDuration ?? 60,
    preferredTime: body.preferredTime ?? "afternoon",
  };

  const next = [...existing, entry];

  const { error: writeErr } = await (db as any)
    .from("player_schedule_preferences")
    .upsert(
      {
        user_id: userId,
        training_categories: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (writeErr) {
    return NextResponse.json(
      { error: "Failed to save category", detail: writeErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    action: "created",
    category: entry,
    training_categories: next,
  });
}
