/**
 * GET/PUT /api/v1/admin/cv-settings
 *
 * CMS configuration for CV system:
 * - Which sections are visible per sport
 * - Position-specific metric emphasis rules
 * - AI generation model preferences
 * - Share link feature toggles
 *
 * Stored in content_items table with content_type='cv_config'.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();
const CONFIG_KEY = "cv_system_config";

const DEFAULT_CONFIG = {
  // Section visibility per CV type
  club_sections: [
    "identity", "personal_statement", "physical", "positions", "career",
    "performance", "trajectory", "coachability", "competitions", "video_media",
    "references", "character_traits", "injury_status",
  ],
  university_sections: [
    "identity", "personal_statement", "physical", "positions", "career",
    "academic", "dual_role", "performance", "trajectory", "coachability",
    "competitions", "video_media", "references", "character_traits", "injury_status",
  ],
  // Position-specific metric emphasis (which metrics to highlight first)
  position_emphasis: {
    GK: ["clean_sheets", "save_percentage", "distribution_accuracy"],
    CB: ["aerial_success", "tackles_per_90", "passing_accuracy"],
    FB: ["sprint_speed", "crosses", "assists"],
    CDM: ["pass_completion", "ball_recovery", "tackles"],
    CM: ["pass_completion", "key_passes", "ball_recovery"],
    CAM: ["assists", "key_passes", "dribbling_success"],
    WM: ["sprint_speed", "dribbling", "crosses"],
    ST: ["goals", "conversion_rate", "shots_on_target"],
  },
  // AI settings
  ai_statement_model: "sonnet",  // sonnet | haiku
  ai_trajectory_model: "haiku",
  ai_dual_role_model: "sonnet",
  // Feature toggles
  share_links_enabled: true,
  pdf_export_enabled: true,
  coachability_visible: true,
  dual_role_visible: true,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const { data } = await (db() as any)
      .from("content_items")
      .select("content")
      .eq("content_type", "cv_config")
      .eq("slug", CONFIG_KEY)
      .single();

    const config = data?.content ?? DEFAULT_CONFIG;
    return NextResponse.json({ config, defaults: DEFAULT_CONFIG });
  } catch (err) {
    // Table might not have the row yet — return defaults
    return NextResponse.json({ config: DEFAULT_CONFIG, defaults: DEFAULT_CONFIG });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const config = { ...DEFAULT_CONFIG, ...body };

    await (db() as any)
      .from("content_items")
      .upsert({
        content_type: "cv_config",
        slug: CONFIG_KEY,
        title: "CV System Configuration",
        content: config,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_type,slug" });

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update CV settings", detail: String(err) },
      { status: 500 }
    );
  }
}
