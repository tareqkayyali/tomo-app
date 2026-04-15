import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  FALLBACK_CONFIG,
  invalidateSchedulingRulesCache,
  type SchedulingRulesConfig,
} from "@/lib/schedulingRulesLoader";

/**
 * Admin Scheduling Rules API
 * ──────────────────────────
 * GET   — read the currently active scheduling_rules row (seeded via
 *         migration 047). Falls back to FALLBACK_CONFIG if the table is
 *         empty so the UI never shows blanks.
 * PATCH — replace the active row's config JSON. Validates shape with Zod,
 *         invalidates the in-process cache on success so the new rules
 *         take effect on the very next /suggest-slots call.
 */

// ── Validation ───────────────────────────────────────────────────

const configSchema = z.object({
  buffers: z.object({
    default: z.number().min(0).max(240),
    afterHighIntensity: z.number().min(0).max(480),
    afterMatch: z.number().min(0).max(960),
    beforeMatch: z.number().min(0).max(480),
  }),
  dayWindow: z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  }),
  preferredTrainingWindow: z.object({
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
  }),
  limits: z.object({
    maxSessionsPerDay: z.number().int().min(1).max(6),
    noHardOnExamDay: z.boolean(),
    intensityCapOnExamDays: z.enum(["REST", "LIGHT", "MODERATE", "HARD"]),
  }),
  priority: z.object({
    normal: z.array(z.string()).min(1),
    leagueActive: z.array(z.string()).min(1),
    examPeriod: z.array(z.string()).min(1),
    leagueExam: z.array(z.string()).min(1),
  }),
});

// ── GET ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("scheduling_rules")
      .select("id, config, updated_at, updated_by")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to load scheduling rules", detail: error.message },
        { status: 500 }
      );
    }

    // No active row yet — return fallback so the UI can render
    if (!data) {
      return NextResponse.json({
        id: null,
        config: FALLBACK_CONFIG,
        updatedAt: null,
        updatedBy: null,
        usingFallback: true,
      });
    }

    return NextResponse.json({
      id: data.id,
      config: data.config as SchedulingRulesConfig,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
      usingFallback: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load scheduling rules", detail: String(err) },
      { status: 500 }
    );
  }
}

// ── PATCH ────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Cross-field sanity: preferred training window inside day window
  const cfg = parsed.data;
  const dayStart = cfg.dayWindow.startHour * 60;
  const dayEnd = cfg.dayWindow.endHour * 60;
  if (
    cfg.preferredTrainingWindow.startMin < dayStart ||
    cfg.preferredTrainingWindow.endMin > dayEnd ||
    cfg.preferredTrainingWindow.startMin >= cfg.preferredTrainingWindow.endMin
  ) {
    return NextResponse.json(
      {
        error:
          "preferredTrainingWindow must be a non-empty range inside dayWindow",
      },
      { status: 400 }
    );
  }

  try {
    const db = supabaseAdmin();

    // Find the active row (there can only be one per partial unique index).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from("scheduling_rules")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (existing?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from("scheduling_rules")
        .update({ config: cfg, updated_by: auth.user.id })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json(
          { error: "Failed to update scheduling rules", detail: error.message },
          { status: 500 }
        );
      }
    } else {
      // First-ever write (no seed row — shouldn't happen post-migration, but safe)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from("scheduling_rules")
        .insert({ config: cfg, is_active: true, updated_by: auth.user.id });

      if (error) {
        return NextResponse.json(
          { error: "Failed to create scheduling rules row", detail: error.message },
          { status: 500 }
        );
      }
    }

    invalidateSchedulingRulesCache();

    return NextResponse.json({ success: true, config: cfg });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update scheduling rules", detail: String(err) },
      { status: 500 }
    );
  }
}
