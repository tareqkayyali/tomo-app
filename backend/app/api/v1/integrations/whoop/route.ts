import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { removeWhoopConnection } from "@/services/integrations/whoopService";

/**
 * DELETE /api/v1/integrations/whoop
 *
 * Disconnects the user's WHOOP account by removing stored tokens.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    await removeWhoopConnection(auth.user.id);

    return NextResponse.json({
      disconnected: true,
      provider: "whoop",
    });
  } catch (err) {
    console.error("[whoop/disconnect] Error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to disconnect WHOOP" },
      { status: 500 }
    );
  }
}
