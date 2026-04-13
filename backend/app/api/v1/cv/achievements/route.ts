/**
 * POST /api/v1/cv/achievements
 *
 * Add a verified achievement to the athlete's CV.
 * Achievements start as "pending" until coach verification.
 *
 * Called by CV & Identity Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    category,
    description,
    date_achieved,
    evidence_url,
  } = body;

  if (!title || !category) {
    return NextResponse.json(
      { error: "title and category are required" },
      { status: 400 },
    );
  }

  const validCategories = [
    "competition",
    "personal_best",
    "team_selection",
    "certification",
    "academic",
    "leadership",
    "community",
  ];

  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${validCategories.join(", ")}` },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data: achievement, error: insertError } = await (db as any)
    .from("athlete_achievements")
    .insert({
      user_id: userId,
      title,
      category,
      description: description || null,
      date_achieved: date_achieved || new Date().toISOString().slice(0, 10),
      evidence_url: evidence_url || null,
      verification_status: "pending",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to add achievement", detail: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    achievement: {
      id: achievement?.id,
      title,
      category,
      verification_status: "pending",
      date_achieved: date_achieved || new Date().toISOString().slice(0, 10),
    },
  });
}
