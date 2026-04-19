import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { findSimilar } from "@/services/admin/ragChunkAdminService";

/**
 * POST /api/v1/admin/enterprise/knowledge/chunks/similar
 *   Body: { text: string, limit?: number }
 *   Returns: { similar: [{ chunk_id, domain, title, similarity }] }
 *
 * Used by the knowledge editor to surface nearest-neighbor chunks before
 * commit — catches duplication before the editor saves.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  let body: { text?: unknown; limit?: unknown };
  try {
    body = (await req.json()) as { text?: unknown; limit?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const limit =
    typeof body.limit === "number" && body.limit > 0 && body.limit <= 20
      ? Math.floor(body.limit)
      : 5;

  if (!text.trim()) {
    return NextResponse.json({ similar: [] });
  }

  try {
    const similar = await findSimilar(text, limit);
    return NextResponse.json({ similar });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
