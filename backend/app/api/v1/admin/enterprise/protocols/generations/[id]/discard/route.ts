/**
 * POST /api/v1/admin/enterprise/protocols/generations/[id]/discard
 *
 * Marks a generation as discarded when the PD rejects the AI draft in the UI
 * without saving. Fire-and-forget from the UI — closes the audit loop so we
 * can measure accept/discard ratios per PD.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { markGenerationOutcome } from "@/services/admin/pdProtocolGenerator";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing generation id" }, { status: 400 });
  }

  // Fetch the row and confirm the caller owns it (or is super_admin / same tenant)
  // before touching outcome. Service-role writes bypass RLS, so we enforce
  // here.
  const db = supabaseAdmin() as any;
  const { data: gen, error } = await db
    .from("pd_protocol_generations")
    .select("generation_id, created_by, tenant_id, outcome")
    .eq("generation_id", id)
    .single();

  if (error || !gen) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  // Access check. Super admins see all. Institutional PDs can discard their
  // own generations or any on a tenant they are a member of.
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

  // Idempotent — only move pending → discarded. Do not overwrite saved/failed.
  if (gen.outcome !== "pending") {
    return NextResponse.json({
      generation_id: id,
      outcome: gen.outcome,
      unchanged: true,
    });
  }

  await markGenerationOutcome(id, "discarded", null);

  return NextResponse.json({
    generation_id: id,
    outcome: "discarded",
  });
}
