import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import {
  listChunks,
  getChunk,
  upsertChunk,
} from "@/services/admin/ragChunkAdminService";

/**
 * GET /api/v1/admin/enterprise/knowledge/chunks
 *   List chunks scoped to the caller's tenant hierarchy.
 *   Returns `{ chunks: [...] }`.
 *
 * GET /api/v1/admin/enterprise/knowledge/chunks?id=<uuid>
 *   Return a single chunk (for the editor page fetch-on-mount).
 *   Returns `{ chunk: {...} }`.
 *
 * POST /api/v1/admin/enterprise/knowledge/chunks
 *   Create. Re-embeds via Voyage AI on write.
 *
 * PATCH /api/v1/admin/enterprise/knowledge/chunks
 *   Update. Body must include `chunk_id`. Re-embeds.
 */

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      const chunk = await getChunk(id);
      if (!chunk) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ chunk });
    }

    const chunks = await listChunks({
      tenantIds: auth.user.memberships.map((m) => m.tenant_id),
      isSuperAdmin: auth.user.isSuperAdmin,
    });
    return NextResponse.json({ chunks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const chunk = await upsertChunk(coerceWriteInput(body));
    return NextResponse.json({ chunk }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.chunk_id || typeof body.chunk_id !== "string") {
    return NextResponse.json(
      { error: "chunk_id is required for PATCH" },
      { status: 400 }
    );
  }

  try {
    const chunk = await upsertChunk(coerceWriteInput(body));
    return NextResponse.json({ chunk });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Coerce the editor page's loose payload (which includes ignored fields
 * like `tags`, `subdomain`, `citations`, `version`) into the strict
 * ChunkWriteInput expected by the service. Unknown fields are dropped.
 */
function coerceWriteInput(body: Record<string, unknown>) {
  const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
  const asOptStr = (v: unknown): string | null =>
    typeof v === "string" ? v : null;
  const asStrArr = (v: unknown): string[] | null =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : null;

  return {
    chunk_id:
      typeof body.chunk_id === "string" && body.chunk_id
        ? body.chunk_id
        : undefined,
    domain: asStr(body.domain),
    title: asStr(body.title),
    content: asStr(body.content),
    athlete_summary: asOptStr(body.athlete_summary),
    coach_summary: asOptStr(body.coach_summary),
    rec_types: asStrArr(body.rec_types),
    phv_stages: asStrArr(body.phv_stages),
    age_groups: asStrArr(body.age_groups),
    sports: asStrArr(body.sports),
    contexts: asStrArr(body.contexts),
    primary_source: asOptStr(body.primary_source),
    evidence_grade: asOptStr(body.evidence_grade),
    last_reviewed: asOptStr(body.last_reviewed),
    institution_id: asOptStr(body.institution_id),
  };
}
