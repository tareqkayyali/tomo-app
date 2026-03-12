import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { revokeRelationship } from "@/services/relationshipService";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await revokeRelationship(auth.user.id, id);

    return NextResponse.json(
      { success: true },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not found")
      ? 404
      : message.includes("Not authorized") || message.includes("already revoked")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
