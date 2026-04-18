import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  rankTriangleInputs,
  type WeightRow,
  type VisibilityPrefRow,
} from "@/services/triangle/retrieval";
import type { TriangleInput } from "@/services/triangle/weights";
import { ageTierFromDob } from "@/services/compliance/ageTier";
import type { AgeTier } from "@/types";

// GET /api/v1/admin/triangle-inputs?athlete_id=<uuid>
//
// Admin-only audit endpoint. Returns the full weighted+ranked Triangle
// Input Registry view for a given athlete — what the AI prompt builder
// would actually see + the raw ledger rows for forensic inspection.
// Used to debug "why did the AI say X to this athlete" questions.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const athleteId = url.searchParams.get("athlete_id");
  if (!athleteId) {
    return NextResponse.json(
      { error: "athlete_id required", code: "ATHLETE_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  const [{ data: rawInputs }, { data: weightRows }, { data: prefRows }, { data: athleteRow }] =
    await Promise.all([
      db
        .from("triangle_inputs")
        .select(
          "id, athlete_id, author_id, author_role, domain, input_type, body, event_scope_id, effective_from, effective_until, retracted_at, retracted_reason, moderation_state, created_at"
        )
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("triangle_input_weights")
        .select("age_tier, domain, author_role, base_weight, requires_t3_preference"),
      db
        .from("player_visibility_preferences")
        .select("player_id, guardian_id, domain, visible")
        .eq("player_id", athleteId),
      db
        .from("users")
        .select("id, name, email, date_of_birth")
        .eq("id", athleteId)
        .maybeSingle(),
    ]);

  const athlete = (athleteRow ?? null) as {
    id: string;
    name: string | null;
    email: string | null;
    date_of_birth: string | null;
  } | null;

  const dob = athlete?.date_of_birth ? new Date(athlete.date_of_birth) : null;
  const tier: AgeTier = ageTierFromDob(dob);

  // Full input set (including retracted + hidden) for audit. The pure
  // ranking function filters on moderation + retraction, so we expose
  // BOTH the raw ledger AND the ranked view to admin.
  const rawAll = (rawInputs ?? []) as Array<
    TriangleInput & {
      retracted_reason: string | null;
      moderation_state: string;
    }
  >;

  // Ranked view — what the AI prompt builder would see today (live,
  // no retracted, no hidden).
  const liveInputs = rawAll.filter(
    (r) => r.retracted_at === null && ["cleared", "pending"].includes(r.moderation_state)
  );
  const ranked = rankTriangleInputs(
    liveInputs as TriangleInput[],
    (weightRows ?? []) as WeightRow[],
    (prefRows ?? []) as VisibilityPrefRow[],
    athleteId,
    tier,
    {}
  );

  // Author profiles so the UI can name who wrote each input.
  const authorIds = Array.from(new Set(rawAll.map((r) => r.author_id)));
  const { data: authorRows } = await db
    .from("users")
    .select("id, name, email")
    .in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const authorMap = new Map(
    ((authorRows ?? []) as Array<{ id: string; name: string | null; email: string | null }>)
      .map((u) => [u.id, u])
  );

  return NextResponse.json({
    athlete,
    tier,
    rankedCount: ranked.length,
    rankedTop: ranked.slice(0, 20).map((r) => ({
      id: r.id,
      authorRole: r.author_role,
      author: authorMap.get(r.author_id) ?? { id: r.author_id, name: null, email: null },
      domain: r.domain,
      inputType: r.input_type,
      body: r.body,
      baseWeight: r.baseWeight,
      effectiveWeight: Number(r.effectiveWeight.toFixed(3)),
      createdAt: r.created_at,
    })),
    ledger: rawAll.map((r) => ({
      id: r.id,
      authorRole: r.author_role,
      author: authorMap.get(r.author_id) ?? { id: r.author_id, name: null, email: null },
      domain: r.domain,
      inputType: r.input_type,
      body: r.body,
      eventScopeId: r.event_scope_id,
      effectiveFrom: r.effective_from,
      effectiveUntil: r.effective_until,
      retractedAt: r.retracted_at,
      retractedReason: r.retracted_reason,
      moderationState: r.moderation_state,
      createdAt: r.created_at,
    })),
  });
}
