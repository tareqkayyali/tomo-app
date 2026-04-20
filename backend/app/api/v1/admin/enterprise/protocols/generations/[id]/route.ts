/**
 * GET /api/v1/admin/enterprise/protocols/generations/[id]
 *
 * Full detail for a single generation, including the draft protocol JSON,
 * RAG grounding, validation errors, and (when saved) the final saved protocol.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing generation id" }, { status: 400 });
  }

  const db = supabaseAdmin() as any;

  const { data: gen, error } = await db
    .from("pd_protocol_generations")
    .select("*")
    .eq("generation_id", id)
    .single();

  if (error || !gen) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  // Access check.
  if (!auth.user.isSuperAdmin) {
    const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
    const ownsIt = gen.created_by === auth.user.id;
    const inTenant = gen.tenant_id && tenantIds.includes(gen.tenant_id);
    if (!ownsIt && !inTenant) {
      return NextResponse.json(
        { error: "No access to this generation" },
        { status: 403 },
      );
    }
  }

  // Optionally resolve the saved protocol row.
  let savedProtocol: unknown = null;
  if (gen.saved_protocol_id) {
    const { data: protocol } = await db
      .from("pd_protocols")
      .select("*")
      .eq("protocol_id", gen.saved_protocol_id)
      .single();
    savedProtocol = protocol ?? null;
  }

  return NextResponse.json({
    generation: gen,
    saved_protocol: savedProtocol,
  });
}
