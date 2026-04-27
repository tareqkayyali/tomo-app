import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  getMethodologyDocument,
  type MethodologyDocument,
} from "@/services/admin/methodologyService";
import {
  parseMethodologyDocument,
  type ProposedDirective,
} from "@/services/admin/methodologyParser";
import { createDirective } from "@/services/admin/directiveService";

/**
 * POST /api/v1/admin/pd/instructions/parse
 * Body: { document_id: string }
 *
 * Reads the document, calls Claude to extract proposed directives,
 * validates each against the matching Zod schema, dedups against
 * existing directives for the document, and persists the survivors
 * with status='proposed'. Returns a summary the UI can render.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const documentId: string | undefined = body?.document_id;
  if (!documentId) {
    return NextResponse.json(
      { error: "document_id is required" },
      { status: 400 },
    );
  }

  const doc: MethodologyDocument | null = await getMethodologyDocument(documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const result = await parseMethodologyDocument(doc, auth.user.id);

  // Persist accepted proposals as 'proposed' directives, linked to the doc.
  const created: string[] = [];
  const persistErrors: { source_excerpt?: string; message: string }[] = [];
  for (const p of result.proposed) {
    const draft = buildDirectiveCreatePayload(p, doc.id);
    try {
      const d = await createDirective(draft, auth.user.id);
      created.push(d.id);
    } catch (err) {
      persistErrors.push({
        source_excerpt: p.source_excerpt ?? undefined,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logAudit({
    actor: auth.user,
    action: "bulk_import",
    resource_type: "methodology_document",
    resource_id: doc.id,
    metadata: {
      action: "parse",
      raw_count: result.raw_count,
      proposed_persisted: created.length,
      duplicates_skipped: result.duplicates.length,
      validation_errors: result.errors.length,
      persist_errors: persistErrors.length,
      cost_usd: result.cost_usd,
      latency_ms: result.latency_ms,
    },
    req,
  });

  return NextResponse.json({
    document_id: doc.id,
    raw_count: result.raw_count,
    persisted: created.length,
    duplicates_skipped: result.duplicates.length,
    validation_errors: result.errors,
    persist_errors: persistErrors,
    cost_usd: result.cost_usd,
    latency_ms: result.latency_ms,
    persisted_directive_ids: created,
  });
}

function buildDirectiveCreatePayload(p: ProposedDirective, documentId: string) {
  return {
    document_id: documentId,
    directive_type: p.directive_type,
    audience: p.audience,
    sport_scope: p.sport_scope,
    age_scope: p.age_scope,
    phv_scope: p.phv_scope,
    position_scope: p.position_scope,
    mode_scope: p.mode_scope,
    priority: p.priority,
    payload: p.payload,
    source_excerpt: p.source_excerpt,
    confidence: p.confidence,
    status: "proposed" as const,
    change_reason: "parsed from methodology document",
  };
}
