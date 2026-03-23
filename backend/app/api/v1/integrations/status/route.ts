import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface WearableRow {
  provider: string;
  sync_status: string | null;
  sync_error: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  external_user_id: string | null;
}

/**
 * GET /api/v1/integrations/status
 *
 * Returns the connection status of all wearable integrations for the user.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    // wearable_connections not yet in generated types — cast to any
    const db = supabaseAdmin() as any;

    const { data: connections, error } = await db
      .from("wearable_connections")
      .select(
        "provider, sync_status, sync_error, last_sync_at, connected_at, external_user_id"
      )
      .eq("user_id", auth.user.id) as { data: WearableRow[] | null; error: any };

    if (error) {
      console.error("[integrations/status] Error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch integration status" },
        { status: 500 }
      );
    }

    // Build status map — include known providers even if not connected
    const connMap = new Map<string, WearableRow>(
      (connections || [])
        .filter((c: WearableRow) => c.provider !== null)
        .map((c: WearableRow) => [c.provider, c])
    );

    const providers = ["whoop", "garmin", "oura", "fitbit"] as const;

    const integrations = providers.map((provider) => {
      const conn = connMap.get(provider);
      // Filter out pending connections (access_token === "__pending__")
      const isConnected = conn && conn.sync_status !== null;

      return {
        provider,
        connected: !!isConnected,
        sync_status: conn?.sync_status || null,
        sync_error: conn?.sync_error || null,
        last_sync_at: conn?.last_sync_at || null,
        connected_at: conn?.connected_at || null,
      };
    });

    return NextResponse.json({ integrations });
  } catch (err) {
    console.error('[GET /api/v1/integrations/status] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
