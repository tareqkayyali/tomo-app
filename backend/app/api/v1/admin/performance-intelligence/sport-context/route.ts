import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { sportCoachingContextSchema } from "@/lib/validation/performanceIntelligenceSchemas";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import {
  getSportCoachingConfig,
  clearSportCoachingCache,
} from "@/services/admin/performanceIntelligenceService";

const CONFIG_KEY = "sport_coaching_context";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const config = await getSportCoachingConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load sport coaching config", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = sportCoachingContextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await upsertUIConfig({ config_key: CONFIG_KEY, config_value: parsed.data as Record<string, unknown> });
    clearSportCoachingCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save sport coaching config", detail: String(err) },
      { status: 500 }
    );
  }
}
