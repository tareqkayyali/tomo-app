import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST   /api/v1/ugc/blocks  — body: { blockedUserId, scope?, reason? }
// DELETE /api/v1/ugc/blocks  — body: { blockedUserId }
// GET    /api/v1/ugc/blocks  — list own active blocks
//
// Required by Apple 1.2 — every authenticated user must be able to
// block another user. Scopes: full | messages_only | visibility_only.

const VALID_SCOPES = new Set(["full", "messages_only", "visibility_only"]);

type UntypedDb = { from: (table: string) => any };

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as unknown as UntypedDb;
  const { data, error } = await db
    .from("ugc_blocks")
    .select("blocked_id, scope, reason, created_at")
    .eq("blocker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "LIST_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { blockedUserId, scope, reason } = body as Record<string, unknown>;

    if (typeof blockedUserId !== "string" || blockedUserId.length === 0) {
      return NextResponse.json(
        { error: "blockedUserId required", code: "BLOCKED_ID_REQUIRED" },
        { status: 400 }
      );
    }
    if (blockedUserId === auth.user.id) {
      return NextResponse.json(
        { error: "Cannot block yourself", code: "SELF_BLOCK_REJECTED" },
        { status: 400 }
      );
    }
    const scopeVal = typeof scope === "string" && VALID_SCOPES.has(scope) ? scope : "full";

    const db = supabaseAdmin() as unknown as UntypedDb;

    // Upsert so repeat blocks update scope/reason rather than failing.
    const { data, error } = await db
      .from("ugc_blocks")
      .upsert({
        blocker_id: auth.user.id,
        blocked_id: blockedUserId,
        scope: scopeVal,
        reason: typeof reason === "string" && reason.length > 0 ? reason : null,
      })
      .select("blocker_id, blocked_id, scope, created_at")
      .single();

    if (error || !data) {
      console.error("[POST /ugc/blocks] upsert error:", error);
      return NextResponse.json(
        { error: "Failed to create block", code: "BLOCK_INSERT_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({ block: data, ok: true }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /ugc/blocks]", msg);
    return NextResponse.json({ error: msg, code: "BLOCK_FAILED" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { blockedUserId } = body as Record<string, unknown>;
    if (typeof blockedUserId !== "string" || blockedUserId.length === 0) {
      return NextResponse.json(
        { error: "blockedUserId required", code: "BLOCKED_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin() as unknown as UntypedDb;
    const { error } = await db
      .from("ugc_blocks")
      .delete()
      .eq("blocker_id", auth.user.id)
      .eq("blocked_id", blockedUserId);

    if (error) {
      return NextResponse.json({ error: error.message, code: "UNBLOCK_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /ugc/blocks]", msg);
    return NextResponse.json({ error: msg, code: "UNBLOCK_FAILED" }, { status: 500 });
  }
}
