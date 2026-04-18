import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { moderate } from "@/services/moderation/moderate";
import { ageTierFromDob } from "@/services/compliance/ageTier";
import { rankTriangleInputs, type WeightRow, type VisibilityPrefRow } from "@/services/triangle/retrieval";
import type { TriangleInput } from "@/services/triangle/weights";
import type { AgeTier } from "@/types";

// POST /api/v1/triangle-inputs
//   Author (coach/parent) creates a weighted input for an athlete.
//   Body: { athleteId, domain, inputType, body, eventScopeId?,
//           effectiveFrom?, effectiveUntil? }
//
// GET /api/v1/triangle-inputs?athlete_id=<uuid>&event_id=<uuid>&domain=<...>&topN=<n>
//   Returns weighted + ranked inputs for an athlete. Used by the AI
//   prompt builder (P2.4) to inject between Dual-Load and RAG.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_DOMAINS = new Set([
  "training", "academic", "wellbeing", "safety", "logistics",
]);
const VALID_INPUT_TYPES = new Set([
  "standing_instruction", "constraint", "preference", "observation", "goal",
]);

async function authorRoleFor(
  db: UntypedDb,
  authorId: string,
  athleteId: string
): Promise<"coach" | "parent" | null> {
  if (authorId === athleteId) return null; // athlete authoring triangle inputs is not supported
  const { data } = await db
    .from("relationships")
    .select("relationship_type, status")
    .eq("guardian_id", authorId)
    .eq("player_id", athleteId)
    .eq("status", "accepted")
    .maybeSingle();
  const row = (data ?? null) as { relationship_type: string } | null;
  if (!row) return null;
  if (row.relationship_type === "coach" || row.relationship_type === "parent") {
    return row.relationship_type;
  }
  return null;
}

// ── POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const {
      athleteId, domain, inputType, body: text,
      eventScopeId, effectiveFrom, effectiveUntil,
    } = body as Record<string, unknown>;

    if (typeof athleteId !== "string" || athleteId.length === 0) {
      return NextResponse.json({ error: "athleteId required", code: "ATHLETE_ID_REQUIRED" }, { status: 400 });
    }
    if (typeof domain !== "string" || !VALID_DOMAINS.has(domain)) {
      return NextResponse.json({ error: "Invalid domain", code: "INVALID_DOMAIN" }, { status: 400 });
    }
    if (typeof inputType !== "string" || !VALID_INPUT_TYPES.has(inputType)) {
      return NextResponse.json({ error: "Invalid inputType", code: "INVALID_INPUT_TYPE" }, { status: 400 });
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "body required", code: "BODY_REQUIRED" }, { status: 400 });
    }

    const db = supabaseAdmin() as unknown as UntypedDb;

    const role = await authorRoleFor(db, auth.user.id, athleteId);
    if (!role) {
      return NextResponse.json(
        { error: "No accepted coach/parent relationship with this athlete", code: "UNAUTHORIZED_AUTHOR" },
        { status: 403 }
      );
    }

    // Determine minor-recipient for stricter moderation thresholds.
    const { data: athlete } = await db
      .from("users")
      .select("date_of_birth")
      .eq("id", athleteId)
      .maybeSingle();
    const dob = (athlete as { date_of_birth: string | null } | null)?.date_of_birth
      ? new Date((athlete as { date_of_birth: string }).date_of_birth)
      : null;
    const tier: AgeTier = ageTierFromDob(dob);
    const recipientIsMinor = tier !== "T3";

    let modResult: Awaited<ReturnType<typeof moderate>>;
    try {
      modResult = await moderate({
        body: text,
        targetType: "coach_note",  // reuse the nearest UGC target type
        authorId: auth.user.id,
        recipientIsMinor,
      });
    } catch (err) {
      console.error("[triangle-inputs] moderate() failed:", err);
      return NextResponse.json(
        { error: "Moderation service unavailable", code: "MODERATION_OUTAGE" },
        { status: 503 }
      );
    }

    const insertRes = await db
      .from("triangle_inputs")
      .insert({
        athlete_id: athleteId,
        author_id: auth.user.id,
        author_role: role,
        domain,
        input_type: inputType,
        body: text,
        event_scope_id: typeof eventScopeId === "string" && eventScopeId.length > 0 ? eventScopeId : null,
        effective_from: typeof effectiveFrom === "string" ? effectiveFrom : new Date().toISOString(),
        effective_until: typeof effectiveUntil === "string" ? effectiveUntil : null,
        moderation_state: modResult.moderationState,
      })
      .select("id, created_at")
      .single();

    const inserted = (insertRes.data ?? null) as { id: string; created_at: string } | null;
    if (insertRes.error || !inserted) {
      console.error("[triangle-inputs] insert error:", insertRes.error);
      return NextResponse.json({ error: "Insert failed", code: "INSERT_FAILED" }, { status: 500 });
    }

    // Auto-hide → enqueue for review.
    if (modResult.autoHide) {
      await db.from("ugc_moderation_queue").insert({
        target_type: "coach_note",
        target_id: inserted.id,
        trigger: "classifier",
        classifier_score: modResult.classifierScore ?? null,
        severity: modResult.severity,
        state: "auto_hidden",
      });
    }

    return NextResponse.json(
      { id: inserted.id, moderationState: modResult.moderationState, ok: true },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /triangle-inputs]", msg);
    return NextResponse.json({ error: msg, code: "CREATE_FAILED" }, { status: 500 });
  }
}

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const athleteId = url.searchParams.get("athlete_id");
    if (!athleteId) {
      return NextResponse.json({ error: "athlete_id required", code: "ATHLETE_ID_REQUIRED" }, { status: 400 });
    }
    const eventId = url.searchParams.get("event_id") ?? undefined;
    const domain = url.searchParams.get("domain") ?? undefined;
    const topN = Number(url.searchParams.get("topN") ?? "12");

    const db = supabaseAdmin() as unknown as UntypedDb;

    // Authorisation: caller is the athlete, or a guardian that
    // fn_guardian_can_read permits. We delegate to RLS by NOT using
    // service-role here — wait, we're already service-role via
    // supabaseAdmin. Apply the check at app layer:
    if (auth.user.id !== athleteId) {
      // Check any-domain visibility; finer-grained filtering is applied
      // below against the weight matrix.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpc = db as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }> };
      const { data: canRead } = await rpc.rpc("fn_guardian_can_read", {
        p_player_id: athleteId,
        p_guardian_id: auth.user.id,
        p_domain: domain ?? null,
      });
      if (!canRead) {
        return NextResponse.json(
          { error: "Not authorised", code: "UNAUTHORIZED" },
          { status: 403 }
        );
      }
    }

    // Load inputs, weights, and T3 preferences in parallel.
    const [{ data: rawInputs }, { data: weightRows }, { data: prefRows }, { data: athleteRow }] = await Promise.all([
      db
        .from("triangle_inputs")
        .select("id, athlete_id, author_id, author_role, domain, input_type, body, event_scope_id, effective_from, effective_until, retracted_at, created_at")
        .eq("athlete_id", athleteId)
        .is("retracted_at", null)
        .in("moderation_state", ["cleared", "pending"])
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("triangle_input_weights")
        .select("age_tier, domain, author_role, base_weight, requires_t3_preference"),
      db
        .from("player_visibility_preferences")
        .select("player_id, guardian_id, domain, visible")
        .eq("player_id", athleteId),
      db
        .from("users")
        .select("date_of_birth")
        .eq("id", athleteId)
        .maybeSingle(),
    ]);

    const dob = (athleteRow as { date_of_birth: string | null } | null)?.date_of_birth
      ? new Date((athleteRow as { date_of_birth: string }).date_of_birth)
      : null;
    const tier: AgeTier = ageTierFromDob(dob);

    const ranked = rankTriangleInputs(
      (rawInputs ?? []) as TriangleInput[],
      (weightRows ?? []) as WeightRow[],
      (prefRows ?? []) as VisibilityPrefRow[],
      athleteId,
      tier,
      {
        eventId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        domains: domain ? ([domain] as any) : undefined,
        topN: Number.isFinite(topN) && topN > 0 ? topN : 12,
      }
    );

    return NextResponse.json({ athleteId, tier, inputs: ranked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /triangle-inputs]", msg);
    return NextResponse.json({ error: msg, code: "LIST_FAILED" }, { status: 500 });
  }
}
