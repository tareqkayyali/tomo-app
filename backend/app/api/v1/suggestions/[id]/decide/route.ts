import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decideApproval } from "@/services/suggestionService";

// POST /api/v1/suggestions/:id/decide
// Body: { decision: 'accept' | 'decline' | 'edit', notes?: string }
//
// An authorised approver (coach or parent with accepted relationship to
// the athlete) lands a decision on an approval_request suggestion.
// Runs the pure resolver + persists the result. Safety gates are not
// re-run here — they belong to the call site that consumes the
// resolution (e.g. programPublish checks ACWR / PHV after approval).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_DECISIONS = new Set(["accept", "decline", "edit"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required", code: "ID_REQUIRED" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
  }

  const { decision, notes } = body as Record<string, unknown>;
  if (typeof decision !== "string" || !VALID_DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: "decision must be accept | decline | edit", code: "INVALID_DECISION" },
      { status: 400 }
    );
  }

  try {
    const db = supabaseAdmin() as unknown as UntypedDb;

    // Load the target so we can verify the caller is the right approver.
    const { data: row } = await db
      .from("suggestions")
      .select("id, player_id, required_approver_role, mode, status")
      .eq("id", id)
      .maybeSingle();

    const suggestion = (row ?? null) as {
      id: string;
      player_id: string;
      required_approver_role: "coach" | "parent" | "athlete" | null;
      mode: string;
      status: string;
    } | null;

    if (!suggestion) {
      return NextResponse.json(
        { error: "Suggestion not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    if (suggestion.mode !== "approval_request") {
      return NextResponse.json(
        { error: "Suggestion is not in approval_request mode", code: "WRONG_MODE" },
        { status: 400 }
      );
    }
    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: `Suggestion already ${suggestion.status}`, code: "ALREADY_RESOLVED" },
        { status: 409 }
      );
    }

    // Figure out the decider's role relative to the athlete.
    let deciderRole: "coach" | "parent" | "athlete";
    if (auth.user.id === suggestion.player_id) {
      deciderRole = "athlete";
    } else {
      // Must have an accepted relationship as the required role (if set)
      // else any accepted guardian role. RLS also gates this but we
      // want a clean 403 with a structured error code.
      const wantedTypes = suggestion.required_approver_role
        ? [suggestion.required_approver_role]
        : (["coach", "parent"] as Array<"coach" | "parent">);
      const rel = await requireRelationship(
        auth.user.id,
        suggestion.player_id,
        // athlete isn't a relationship type; only coach/parent reach here
        wantedTypes.filter((t) => t !== "athlete") as ("coach" | "parent")[]
      );
      if ("error" in rel) return rel.error;

      // Infer decider role by looking up the relationship_type.
      const { data: relRow } = await db
        .from("relationships")
        .select("relationship_type")
        .eq("guardian_id", auth.user.id)
        .eq("player_id", suggestion.player_id)
        .eq("status", "accepted")
        .maybeSingle();
      const rt = (relRow as { relationship_type: string } | null)?.relationship_type;
      if (rt !== "coach" && rt !== "parent") {
        return NextResponse.json(
          { error: "Unknown relationship type", code: "UNKNOWN_RELATIONSHIP" },
          { status: 403 }
        );
      }
      deciderRole = rt;

      if (suggestion.required_approver_role && suggestion.required_approver_role !== deciderRole) {
        return NextResponse.json(
          {
            error: `This approval requires ${suggestion.required_approver_role} authority`,
            code: "WRONG_APPROVER_ROLE",
          },
          { status: 403 }
        );
      }
    }

    const result = await decideApproval({
      suggestionId: id,
      deciderId: auth.user.id,
      deciderRole,
      decision: decision as "accept" | "decline" | "edit",
      notes: typeof notes === "string" ? notes : undefined,
    });

    return NextResponse.json({
      suggestion: result.suggestion,
      resolved: result.resolved,
      tier: result.tier,
      ok: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /suggestions/:id/decide]", msg);
    return NextResponse.json({ error: msg, code: "DECIDE_FAILED" }, { status: 500 });
  }
}
