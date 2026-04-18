import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getConsentStatus } from "@/services/consent/consentService";

// GET /api/v1/consents/status?subjectUserId=<uuid>
// Default: caller's own consent state. Parents can query a linked
// minor's state by passing subjectUserId; relationship check enforced
// at the API layer so parents can't see a stranger's state.

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const subject = url.searchParams.get("subjectUserId");
    const targetUserId = subject && subject.length > 0 ? subject : auth.user.id;

    if (targetUserId !== auth.user.id) {
      // Parent checking a linked minor — verify relationship via the
      // centralised visibility rule so T3 athletes' preferences are
      // respected. RPC is from migration 064 and not yet in the
      // generated types graph — narrow cast at the boundary.
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const db = supabaseAdmin() as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }>;
      };
      const { data } = await db.rpc("fn_guardian_can_read", {
        p_player_id: targetUserId,
        p_guardian_id: auth.user.id,
        p_domain: null,
      });
      if (!data) {
        return NextResponse.json(
          { error: "Not authorised to read this subject", code: "UNAUTHORIZED_SUBJECT" },
          { status: 403 }
        );
      }
    }

    const rows = await getConsentStatus(targetUserId);
    return NextResponse.json({ subjectUserId: targetUserId, consents: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /consents/status]", msg);
    return NextResponse.json({ error: msg, code: "STATUS_FAILED" }, { status: 500 });
  }
}
