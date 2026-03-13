import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { createRelationshipByEmail } from "@/services/relationshipService";
import { linkByEmailSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent", "coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const body = await req.json();
    const parsed = linkByEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Determine caller's role for relationship type
    const callerRole = roleCheck.role as "parent" | "coach";

    const result = await createRelationshipByEmail(
      auth.user.id,
      parsed.data.email,
      callerRole
    );

    return NextResponse.json(result, {
      status: 201,
      headers: { "api-version": "v1" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";

    // Map specific error messages to appropriate HTTP status codes
    if (message.includes("No player account found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("already linked") || message.includes("already pending")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("not a player account") || message.includes("Cannot link to yourself")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
