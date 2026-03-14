import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSuggestion } from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";
import type { Json } from "@/types/database";

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

    // Also insert into phone_test_sessions so the player sees it in My Tests
    const db = supabaseAdmin();
    // Normalize test type: underscores → dashes to match catalog IDs
    const normalizedTestType = testType.replace(/_/g, "-");

    await db.from("phone_test_sessions").insert({
      user_id: playerId,
      date: new Date().toISOString().slice(0, 10),
      test_type: normalizedTestType,
      score: values.primaryValue,
      raw_data: {
        unit: values.unit,
        source: "coach",
        coachId: auth.user.id,
        suggestionId: suggestion.id,
        ...(rawInputs?.notes ? { notes: rawInputs.notes } : {}),
      } as unknown as Json,
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
