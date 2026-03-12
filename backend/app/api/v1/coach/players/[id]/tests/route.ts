import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSuggestion } from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: playerId } = await params;

  const relResult = await requireRelationship(auth.user.id, playerId);
  if ("error" in relResult) return relResult.error;

  try {
    const db = supabaseAdmin();

    const { data: tests, error } = await db
      .from("suggestions")
      .select("*")
      .eq("player_id", playerId)
      .eq("suggestion_type", "test_result")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { tests: tests || [] },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: playerId } = await params;

  const relResult = await requireRelationship(auth.user.id, playerId);
  if ("error" in relResult) return relResult.error;

  try {
    const body = await req.json();
    const { testType, sport, values, rawInputs } = body;

    if (!testType || !sport || !values?.primaryValue || !values?.unit) {
      return NextResponse.json(
        { error: "Missing required fields: testType, sport, values.primaryValue, values.unit" },
        { status: 400 }
      );
    }

    const suggestion = await createSuggestion({
      playerId,
      authorId: auth.user.id,
      authorRole: roleCheck.role,
      suggestionType: "test_result",
      title: `${testType} – ${values.primaryValue}${values.unit}`,
      payload: {
        testType,
        sport,
        values,
        ...(rawInputs ? { rawInputs } : {}),
      },
    });

    await createNotification({
      userId: playerId,
      type: "test_result_added",
      title: "New test result recorded",
      body: `Your coach logged a ${testType} result: ${values.primaryValue}${values.unit}`,
      data: { suggestionId: suggestion.id },
    });

    return NextResponse.json(
      { suggestion },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
