import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import {
  getAllConfigs,
  upsertConfig,
} from "@/services/notifications/notificationConfigService";
import { NOTIFICATION_TEMPLATES } from "@/services/notifications/notificationTemplates";

const HEADERS = { "api-version": "v1" };

/**
 * GET /api/v1/admin/notifications/config
 *
 * Returns all 22 notification types merged with admin overrides.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const configs = await getAllConfigs();
    return NextResponse.json({ configs }, { headers: HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load notification configs" },
      { status: 500, headers: HEADERS }
    );
  }
}

/**
 * PUT /api/v1/admin/notifications/config
 *
 * Upsert admin config for a notification type.
 * Body: { type, enabled?, priority_override?, push_enabled?, notes? }
 *
 * Critical types cannot have enabled = false (returns 400).
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { type, enabled, priority_override, push_enabled, notes } = body;

    if (!type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400, headers: HEADERS }
      );
    }

    if (!NOTIFICATION_TEMPLATES[type as keyof typeof NOTIFICATION_TEMPLATES]) {
      return NextResponse.json(
        { error: `Unknown notification type: ${type}` },
        { status: 400, headers: HEADERS }
      );
    }

    await upsertConfig(
      type,
      { enabled, priority_override, push_enabled, notes },
      auth.user.id
    );

    return NextResponse.json({ success: true, type }, { headers: HEADERS });
  } catch (err: any) {
    // Critical type safety error
    if (err.message?.includes("Cannot disable critical")) {
      return NextResponse.json(
        { error: err.message },
        { status: 400, headers: HEADERS }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to save config" },
      { status: 500, headers: HEADERS }
    );
  }
}
