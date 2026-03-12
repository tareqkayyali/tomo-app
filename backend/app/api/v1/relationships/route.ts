import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listRelationships } from "@/services/relationshipService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const relationships = await listRelationships(auth.user.id);

    return NextResponse.json(
      { relationships },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
