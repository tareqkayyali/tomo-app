import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/admin/audit";

/**
 * Admin Dual Load Thresholds API.
 *
 * GET  — list all threshold rows (ordered by dli_min)
 * PATCH  — upsert a single row by id; body = full row shape.
 *
 * dli_min is the lower bound of the Dual Load Index bucket. Each row
 * defines the coaching advice + thresholds for that bucket.
 */

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("dual_load_thresholds")
      .select("*")
      .order("dli_min", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to list dual load thresholds", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ thresholds: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list dual load thresholds", detail: String(err) },
      { status: 500 }
    );
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

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  // Strip id + any audit timestamps so they aren't overwritten.
  const { id: _drop, created_at: _c, updated_at: _u, ...updates } = body;
  void _drop;
  void _c;
  void _u;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data: before } = await db
      .from("dual_load_thresholds")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const { data, error } = await db
      .from("dual_load_thresholds")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update threshold", detail: error.message },
        { status: 500 }
      );
    }

    await logAudit({
      actor: auth.user,
      action: "update",
      resource_type: "dual_load_threshold",
      resource_id: id,
      metadata: { before, after: data },
      req,
    });

    return NextResponse.json({ threshold: data });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update threshold", detail: String(err) },
      { status: 500 }
    );
  }
}
