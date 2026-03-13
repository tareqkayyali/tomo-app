import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { acceptLinkRequest, declineLinkRequest } from "@/services/relationshipService";
import { respondLinkSchema } from "@/lib/validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["player"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const { id: relationshipId } = await params;
    const body = await req.json();
    const parsed = respondLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.action === "accept") {
      await acceptLinkRequest(auth.user.id, relationshipId);
    } else {
      await declineLinkRequest(auth.user.id, relationshipId);
    }

    return NextResponse.json(
      { success: true },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Not authorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("already been resolved")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
