import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { readinessDecisionMatrixSchema } from "@/lib/validation/performanceIntelligenceSchemas";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import {
  getReadinessMatrixConfig,
  clearReadinessMatrixCache,
} from "@/services/admin/performanceIntelligenceService";

const CONFIG_KEY = "readiness_decision_matrix";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const config = await getReadinessMatrixConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load readiness matrix", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = readinessDecisionMatrixSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await upsertUIConfig({ config_key: CONFIG_KEY, config_value: parsed.data as Record<string, unknown> });
    clearReadinessMatrixCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save readiness matrix", detail: String(err) },
      { status: 500 }
    );
  }
}
