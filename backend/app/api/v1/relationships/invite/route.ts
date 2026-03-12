import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { generateInviteCode } from "@/services/relationshipService";
import { z } from "zod";

const inviteSchema = z.object({
  targetRole: z.enum(["coach", "parent"]),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach", "parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code, expiresAt } = await generateInviteCode(
      auth.user.id,
      parsed.data.targetRole
    );

    return NextResponse.json(
      { code, expiresAt },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
