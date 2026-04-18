import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ageTierFromDob } from "@/services/compliance/ageTier";

// GET /api/v1/admin/users/lookup?q=<email | uuid | name-fragment>
// Admin-only user search for the dob-override flow + other admin
// targeted actions. Returns up to 20 matches ordered by created_at
// desc.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ rows: [] });
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  let query = db
    .from("users")
    .select("id, name, email, role, date_of_birth, consent_status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (UUID_RE.test(q)) {
    query = query.eq("id", q);
  } else if (q.includes("@")) {
    query = query.ilike("email", `%${q}%`);
  } else {
    // Name fragment — try name ilike + fallback to email ilike.
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, code: "LOOKUP_FAILED" }, { status: 500 });
  }

  const rows = ((data ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
    date_of_birth: string | null;
    consent_status: string | null;
    created_at: string;
  }>).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    dateOfBirth: u.date_of_birth,
    tier: ageTierFromDob(u.date_of_birth ? new Date(u.date_of_birth) : null),
    consentStatus: u.consent_status,
    createdAt: u.created_at,
  }));

  return NextResponse.json({ rows });
}
