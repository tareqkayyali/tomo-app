import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;

    const [themes, pages, flags, uiConfig] = await Promise.all([
      db.from("app_themes").select("updated_at").order("updated_at", { ascending: false }).limit(1).single(),
      db.from("page_configs").select("updated_at").order("updated_at", { ascending: false }).limit(1).single(),
      db.from("feature_flags").select("updated_at").order("updated_at", { ascending: false }).limit(1).single(),
      db.from("ui_config").select("updated_at").order("updated_at", { ascending: false }).limit(1).single(),
    ]);

    return NextResponse.json(
      {
        app_themes: themes.data?.updated_at ?? null,
        page_configs: pages.data?.updated_at ?? null,
        feature_flags: flags.data?.updated_at ?? null,
        ui_config: uiConfig.data?.updated_at ?? null,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=10",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch config manifest", detail: String(err) },
      { status: 500 }
    );
  }
}
