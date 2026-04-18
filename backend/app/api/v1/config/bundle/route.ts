import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_CHAT_PILLS_CONFIG } from "@/lib/chatPills/defaults";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;

    const [themeRes, pagesRes, flagsRes, compStylesRes, chatPillsRes] = await Promise.all([
      db.from("app_themes").select("*").eq("is_active", true).limit(1).single(),
      db.from("page_configs").select("*").eq("is_published", true),
      db.from("feature_flags").select("*"),
      db.from("ui_config").select("config_value").eq("config_key", "component_styles").single(),
      db.from("ui_config").select("config_value").eq("config_key", "chat_pills").single(),
    ]);

    return NextResponse.json(
      {
        theme: themeRes.data ?? null,
        pages: pagesRes.data ?? [],
        flags: flagsRes.data ?? [],
        component_styles: compStylesRes.data?.config_value ?? {},
        // Fall back to in-memory defaults if the seed migration hasn't run yet
        // (or if the row was manually deleted). Mobile always has a valid config.
        chat_pills: chatPillsRes.data?.config_value ?? DEFAULT_CHAT_PILLS_CONFIG,
        fetched_at: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch config bundle", detail: String(err) },
      { status: 500 }
    );
  }
}
