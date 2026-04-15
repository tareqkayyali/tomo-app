import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

/**
 * Admin Safety Gate API
 * ─────────────────────
 * GET   — returns the singleton safety_gate_config row. Seeded by
 *         migration 048, so a freshly-provisioned DB always has a row.
 *         If the row is missing (shouldn't happen post-seed) the route
 *         returns the same defaults the migration uses so the UI never
 *         renders a blank form.
 * PATCH — validates the body with Zod (matching the column constraints),
 *         updates the singleton row, and nudges the ai-service cache via
 *         an advisory call. The ai-service safety_gate.py honours a 60s
 *         TTL so the new config takes effect on the next cache miss
 *         regardless.
 *
 * All edits are audited via updated_at + updated_by on the row itself.
 */

// ── Validation ───────────────────────────────────────────────────

const DEFAULT_PAIN_KEYWORDS = [
  "pain",
  "hurt",
  "injured",
  "injury",
  "sore",
  "tweaked",
  "pulled",
  "strain",
  "sprain",
  "ache",
  "stiff",
  "swollen",
];

const DEFAULTS = {
  enabled: true,
  block_hard_on_red: true,
  block_moderate_on_red: false,
  block_hard_on_yellow: false,
  min_rest_hours_after_hard: 24,
  max_hard_per_week: 3,
  pain_keywords: DEFAULT_PAIN_KEYWORDS,
  red_block_message:
    "Your readiness is in the red today — your body needs recovery, not intensity. Let's swap this for a light mobility + recovery block instead.",
  pain_block_message:
    "Heard you mention pain — I'm going to hold off on the training request. Talk to your physio or coach first, and we'll pick it back up when you're cleared.",
  load_block_message:
    "You've already banked the hard work this week. Another HARD session would push you into overload territory — let's keep today light or moderate.",
};

const configSchema = z.object({
  enabled: z.boolean(),
  block_hard_on_red: z.boolean(),
  block_moderate_on_red: z.boolean(),
  block_hard_on_yellow: z.boolean(),
  min_rest_hours_after_hard: z.number().int().min(0).max(168),
  max_hard_per_week: z.number().int().min(0).max(14),
  pain_keywords: z
    .array(z.string().min(1).max(40))
    .max(50)
    .transform((arr) =>
      // Normalise: trim, lowercase, dedupe, drop empties
      Array.from(
        new Set(arr.map((k) => k.trim().toLowerCase()).filter(Boolean))
      )
    ),
  red_block_message: z.string().min(10).max(400),
  pain_block_message: z.string().min(10).max(400),
  load_block_message: z.string().min(10).max(400),
});

type SafetyGateConfig = z.infer<typeof configSchema>;

// ── GET ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("safety_gate_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to load safety gate config", detail: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      // Defensive fallback — seed should guarantee a row but don't blank
      // the UI if someone truncated the table manually.
      return NextResponse.json({
        id: null,
        config: DEFAULTS,
        updatedAt: null,
        updatedBy: null,
        usingFallback: true,
      });
    }

    const config: SafetyGateConfig = {
      enabled: data.enabled,
      block_hard_on_red: data.block_hard_on_red,
      block_moderate_on_red: data.block_moderate_on_red,
      block_hard_on_yellow: data.block_hard_on_yellow,
      min_rest_hours_after_hard: data.min_rest_hours_after_hard,
      max_hard_per_week: data.max_hard_per_week,
      pain_keywords: data.pain_keywords ?? [],
      red_block_message: data.red_block_message,
      pain_block_message: data.pain_block_message,
      load_block_message: data.load_block_message,
    };

    return NextResponse.json({
      id: data.id,
      config,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
      usingFallback: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load safety gate config", detail: String(err) },
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

  const cfg = parsed.data;

  try {
    const db = supabaseAdmin();

    // Find the singleton row. Migration seeds exactly one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from("safety_gate_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from("safety_gate_config")
        .update({
          enabled: cfg.enabled,
          block_hard_on_red: cfg.block_hard_on_red,
          block_moderate_on_red: cfg.block_moderate_on_red,
          block_hard_on_yellow: cfg.block_hard_on_yellow,
          min_rest_hours_after_hard: cfg.min_rest_hours_after_hard,
          max_hard_per_week: cfg.max_hard_per_week,
          pain_keywords: cfg.pain_keywords,
          red_block_message: cfg.red_block_message,
          pain_block_message: cfg.pain_block_message,
          load_block_message: cfg.load_block_message,
          updated_by: auth.user.id,
        })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to update safety gate config",
            detail: error.message,
          },
          { status: 500 }
        );
      }
    } else {
      // First-ever write (shouldn't happen post-migration, but safe)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any)
        .from("safety_gate_config")
        .insert({
          enabled: cfg.enabled,
          block_hard_on_red: cfg.block_hard_on_red,
          block_moderate_on_red: cfg.block_moderate_on_red,
          block_hard_on_yellow: cfg.block_hard_on_yellow,
          min_rest_hours_after_hard: cfg.min_rest_hours_after_hard,
          max_hard_per_week: cfg.max_hard_per_week,
          pain_keywords: cfg.pain_keywords,
          red_block_message: cfg.red_block_message,
          pain_block_message: cfg.pain_block_message,
          load_block_message: cfg.load_block_message,
          updated_by: auth.user.id,
        });

      if (error) {
        return NextResponse.json(
          {
            error: "Failed to create safety gate config row",
            detail: error.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, config: cfg });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update safety gate config", detail: String(err) },
      { status: 500 }
    );
  }
}
