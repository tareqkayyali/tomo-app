import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { acceptInviteCode } from "@/services/relationshipService";
import { z } from "zod";

const acceptSchema = z.object({
  code: z.string().min(1).max(10),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["player"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const body = await req.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await acceptInviteCode(auth.user.id, parsed.data.code);

    return NextResponse.json(
      {
        relationshipId: result.relationshipId,
        guardianId: result.guardianId,
        relationshipType: result.relationshipType,
      },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Invalid") || message.includes("expired") || message.includes("already")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
