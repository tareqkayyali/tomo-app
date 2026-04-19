import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/admin/audit";

/**
 * Admin Wearable Connections ops panel.
 *
 * GET — paginated list of wearable_connections joined with athlete email,
 *       including sync status + last error. Access tokens are NEVER
 *       returned to the client.
 * DELETE ?id=<uuid> — revoke a connection (hard delete the row). Forces
 *       the athlete to re-auth next time they open the provider screen.
 */

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const provider = sp.get("provider") || undefined;
  const status = sp.get("status") || undefined; // "ok" | "error" | "stale"
  const limit = Math.min(Number(sp.get("limit") ?? "50") || 50, 200);
  const offset = Math.max(Number(sp.get("offset") ?? "0") || 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  let query = db
    .from("wearable_connections")
    .select(
      `
      id,
      user_id,
      provider,
      external_user_id,
      scopes,
      connected_at,
      last_sync_at,
      sync_status,
      sync_error,
      token_expires_at,
      updated_at,
      users!inner (email, name)
    `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (provider) query = query.eq("provider", provider);
  if (status) query = query.eq("sync_status", status);

  try {
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      user_id: string;
      provider: string;
      external_user_id: string | null;
      scopes: string[] | null;
      connected_at: string | null;
      last_sync_at: string | null;
      sync_status: string | null;
      sync_error: string | null;
      token_expires_at: string | null;
      updated_at: string | null;
      users: { email: string | null; name: string | null } | null;
    };

    const rows = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      athlete_email: r.users?.email ?? null,
      athlete_name: r.users?.name ?? null,
      provider: r.provider,
      external_user_id: r.external_user_id,
      scopes: r.scopes ?? [],
      connected_at: r.connected_at,
      last_sync_at: r.last_sync_at,
      sync_status: r.sync_status,
      sync_error: r.sync_error,
      token_expires_at: r.token_expires_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({ rows, total: count ?? rows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data: before } = await db
      .from("wearable_connections")
      .select("id, user_id, provider")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db
      .from("wearable_connections")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({
      actor: auth.user,
      action: "delete",
      resource_type: "wearable_connection",
      resource_id: id,
      metadata: { revoked: true, provider: before?.provider, user_id: before?.user_id },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
