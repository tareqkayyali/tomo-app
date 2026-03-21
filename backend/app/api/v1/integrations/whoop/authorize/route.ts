import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getWhoopAuthUrl } from "@/services/integrations/whoopService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * GET /api/v1/integrations/whoop/authorize
 *
 * Returns the WHOOP OAuth URL as JSON. The frontend calls this with a Bearer
 * token, gets the URL, then redirects the browser to it.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // Generate CSRF state: userId:randomHex
  const stateToken = `${auth.user.id}:${crypto.randomBytes(16).toString("hex")}`;

  // Store state temporarily in metadata of existing connection or a temp record
  const db = supabaseAdmin() as any;
  await db.from("wearable_connections").upsert(
    {
      user_id: auth.user.id,
      provider: "whoop",
      access_token: "__pending__",
      sync_status: "idle",
      metadata: { oauth_state: stateToken },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  const authUrl = getWhoopAuthUrl(stateToken);
  return NextResponse.json({ url: authUrl });
}
