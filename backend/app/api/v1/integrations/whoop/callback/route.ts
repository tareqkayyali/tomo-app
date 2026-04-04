import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  exchangeCodeForTokens,
  fetchProfile,
  storeWhoopConnection,
} from "@/services/integrations/whoopService";

const WEB_APP_URL = "https://app.my-tomo.com";

/** Build redirect URL — use web URL for browser, deep link for native */
function buildRedirect(params: string, platform: string): string {
  if (platform === "native") {
    return `tomo://settings?${params}`;
  }
  return `${WEB_APP_URL}/settings?${params}`;
}

/**
 * GET /api/v1/integrations/whoop/callback
 *
 * OAuth callback from WHOOP. Exchanges authorization code for tokens,
 * fetches user profile, stores the connection, and redirects back to the app.
 *
 * This route is PUBLIC (no auth header) — it's a redirect from WHOOP.
 * Auth is verified via the state parameter containing the user ID.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Extract platform from state early (format: userId:platform:randomHex)
  // Default to "web" for error redirects before state is parsed
  let platform = "web";

  // Handle WHOOP authorization errors
  if (error) {
    console.error("[whoop/callback] Authorization denied:", error);
    return NextResponse.redirect(buildRedirect("whoop=error&reason=denied", platform));
  }

  if (!code || !state) {
    console.error("[whoop/callback] Missing code or state");
    return NextResponse.redirect(buildRedirect("whoop=error&reason=missing_params", platform));
  }

  // Extract userId and platform from state (format: userId:platform:randomHex)
  const parts = state.split(":");
  if (parts.length < 3) {
    // Backwards compat: old format userId:randomHex
    if (parts.length === 2) {
      // old format — treat as web
    } else {
      console.error("[whoop/callback] Invalid state format");
      return NextResponse.redirect(buildRedirect("whoop=error&reason=invalid_state", platform));
    }
  }

  const userId = parts[0];
  if (parts.length >= 3) {
    platform = parts[1]; // "native" or "web"
  }

  // Verify state matches what we stored
  const db = supabaseAdmin() as any;
  const { data: conn } = await db
    .from("wearable_connections")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider", "whoop")
    .single();

  const storedState =
    conn?.metadata && typeof conn.metadata === "object"
      ? (conn.metadata as Record<string, unknown>).oauth_state
      : null;

  if (storedState !== state) {
    console.error("[whoop/callback] State mismatch — possible CSRF");
    return NextResponse.redirect(buildRedirect("whoop=error&reason=state_mismatch", platform));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Fetch WHOOP profile to get external user ID
    let externalUserId: string | undefined;
    try {
      const profile = await fetchProfile(tokens.access_token);
      externalUserId = String(profile.user_id);
    } catch (e) {
      console.warn("[whoop/callback] Could not fetch profile:", e);
    }

    // Store the connection
    await storeWhoopConnection(userId, tokens, externalUserId);

    return NextResponse.redirect(buildRedirect("whoop=connected", platform));
  } catch (err) {
    console.error("[whoop/callback] Token exchange failed:", err);
    return NextResponse.redirect(buildRedirect("whoop=error&reason=token_exchange", platform));
  }
}
