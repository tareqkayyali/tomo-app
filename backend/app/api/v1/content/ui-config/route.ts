import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Public (no auth) GET endpoint for UI config by key.
 * Used by the mobile app to fetch tier config, etc.
 *
 * GET /api/v1/content/ui-config?key=dna_card_tiers
 * Returns the config_value JSON for the given key.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (!key) {
    return NextResponse.json(
      { error: "Missing required query parameter: key" },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("ui_config")
      .select("config_value")
      .eq("config_key", key)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Config not found", key },
        { status: 404 }
      );
    }

    return NextResponse.json(data.config_value);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch UI config", detail: String(err) },
      { status: 500 }
    );
  }
}
