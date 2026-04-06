import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { phvSafetyConfigSchema } from "@/lib/validation/performanceIntelligenceSchemas";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import {
  getPHVSafetyConfig,
  clearPHVSafetyCache,
} from "@/services/admin/performanceIntelligenceService";

const CONFIG_KEY = "phv_safety_config";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const config = await getPHVSafetyConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load PHV safety config", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = phvSafetyConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await upsertUIConfig({ config_key: CONFIG_KEY, config_value: parsed.data as Record<string, unknown> });
    clearPHVSafetyCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save PHV safety config", detail: String(err) },
      { status: 500 }
    );
  }
}
