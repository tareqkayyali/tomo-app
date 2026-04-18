import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/relationships?status=&type=&q=
// Admin-only. Lists coach/parent ↔ athlete relationships with
// filterable status + type + search query.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // 'pending'|'accepted'|'revoked'|null
  const type = url.searchParams.get("type");     // 'coach'|'parent'|null
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const db = supabaseAdmin() as unknown as UntypedDb;

  // Pull relationships first, then join users separately — supabaseAdmin
  // has limited join support on the in-flight types graph and we want
  // stable admin lists even if one side has inactive rows.
  let query = db
    .from("relationships")
    .select("id, guardian_id, player_id, relationship_type, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("relationship_type", type);

  const { data: relRows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, code: "LIST_FAILED" }, { status: 500 });
  }

  const rels = (relRows ?? []) as Array<{
    id: string;
    guardian_id: string;
    player_id: string;
    relationship_type: "coach" | "parent";
    status: "pending" | "accepted" | "revoked";
    created_at: string;
  }>;

  const userIds = Array.from(
    new Set(rels.flatMap((r) => [r.guardian_id, r.player_id]))
  );
  const { data: users } = await db
    .from("users")
    .select("id, name, email, role, date_of_birth")
    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const userMap = new Map(
    ((users ?? []) as Array<{ id: string; name: string | null; email: string | null; role: string | null; date_of_birth: string | null }>)
      .map((u) => [u.id, u])
  );

  const rows = rels.map((r) => ({
    id: r.id,
    relationshipType: r.relationship_type,
    status: r.status,
    createdAt: r.created_at,
    guardian: userMap.get(r.guardian_id) ?? { id: r.guardian_id, name: null, email: null, role: null },
    player: userMap.get(r.player_id) ?? { id: r.player_id, name: null, email: null, role: null, date_of_birth: null },
  }));

  const filtered = q
    ? rows.filter((r) => {
        const hay = [
          r.guardian.name, r.guardian.email,
          r.player.name, r.player.email,
          r.relationshipType,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
    : rows;

  return NextResponse.json({ rows: filtered, total: filtered.length });
}
