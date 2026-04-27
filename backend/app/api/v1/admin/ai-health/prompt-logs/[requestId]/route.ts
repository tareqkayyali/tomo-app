import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/prompt-logs/:requestId
// Returns the full log entry including the blocks JSONB (rendered prompt sections)
// PLUS Phase 6 directive-provenance details: for every directive id present in
// applied_directive_ids, fetch its type / audience / source_excerpt / document
// title so the inspector can show a one-click "where did this come from?" view.

interface DirectiveLite {
  id: string;
  directive_type: string;
  audience: string;
  source_excerpt: string | null;
  document_id: string | null;
  document_title: string | null;
  status: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { requestId } = await params;

  const db = supabaseAdmin() as any;
  const { data: row, error } = await db
    .from("prompt_render_log")
    .select("*")
    .eq("request_id", requestId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[prompt-logs/:id] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Phase 6: enrich applied_directive_ids with details from
  // methodology_directives + methodology_documents.
  const directiveDetails: Record<string, DirectiveLite> = {};
  const idMap = (row?.applied_directive_ids ?? {}) as Record<string, string[]>;
  const allIds = Array.from(
    new Set(Object.values(idMap).flat().filter((s): s is string => typeof s === "string")),
  );

  if (allIds.length > 0) {
    try {
      const { data: directives } = await db
        .from("methodology_directives")
        .select("id, directive_type, audience, source_excerpt, document_id, status")
        .in("id", allIds);

      const docIds = Array.from(
        new Set(
          ((directives ?? []) as any[])
            .map((d) => d.document_id)
            .filter((x): x is string => Boolean(x)),
        ),
      );
      const docTitles: Record<string, string> = {};
      if (docIds.length > 0) {
        const { data: docs } = await db
          .from("methodology_documents")
          .select("id, title")
          .in("id", docIds);
        for (const d of (docs ?? []) as any[]) docTitles[d.id] = d.title;
      }

      for (const d of (directives ?? []) as any[]) {
        directiveDetails[d.id] = {
          id: d.id,
          directive_type: d.directive_type,
          audience: d.audience,
          source_excerpt: d.source_excerpt ?? null,
          document_id: d.document_id ?? null,
          document_title: d.document_id ? (docTitles[d.document_id] ?? null) : null,
          status: d.status,
        };
      }
    } catch (e) {
      console.error("[prompt-logs/:id] directive enrichment failed:", e);
      // Fall through with empty map — inspector will just show the raw ids.
    }
  }

  return NextResponse.json({
    ...row,
    directive_details: directiveDetails,
  });
}
