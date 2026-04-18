import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth";
import { acceptAsGuardian } from "@/services/relationshipService";

/**
 * POST /api/v1/relationships/accept-guardian
 *
 * Phase 3 parent-side of the child-initiated consent flow. Parent
 * enters the 6-char code the child showed them; this creates the
 * relationship AND wires a parental consent row for the child if
 * they were in 'awaiting_parent' state.
 *
 * Kept separate from /relationships/accept (player-only) so neither
 * flow drifts into the other by accident.
 */

const schema = z.object({
  code: z.string().min(1).max(10),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const ipInet =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const result = await acceptAsGuardian(auth.user.id, parsed.data.code, {
      ipInet,
      userAgent,
    });

    return NextResponse.json(
      {
        relationshipId: result.relationshipId,
        childId: result.childId,
        consentGranted: result.consentGranted,
      },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    // Map known user-facing errors to 4xx so the mobile client can
    // show the right message.
    const status =
      message.includes("Invalid") ||
      message.includes("expired") ||
      message.includes("already") ||
      message.includes("not a parent") ||
      message.includes("not from a player")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
