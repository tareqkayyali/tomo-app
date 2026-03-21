/**
 * Debug endpoint — check suggestions for authenticated user
 * GET /api/v1/debug/suggestions
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const userId = auth.user.id;

  // Check all suggestions where this user is the player
  const { data: asPlayer, error: e1 } = await db
    .from("suggestions")
    .select("id, title, suggestion_type, status, payload, author_id, created_at")
    .eq("player_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Check all suggestions where this user is the author
  const { data: asAuthor, error: e2 } = await db
    .from("suggestions")
    .select("id, title, suggestion_type, status, payload, player_id, created_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Check relationships
  const { data: rels, error: e3 } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, relationship_type, status")
    .or(`guardian_id.eq.${userId},player_id.eq.${userId}`)
    .limit(20);

  // Check user role
  const { data: profile } = await db
    .from("users")
    .select("id, name, role, email")
    .eq("id", userId)
    .single();

  return NextResponse.json({
    userId,
    profile,
    suggestionsAsPlayer: {
      count: asPlayer?.length ?? 0,
      error: e1?.message,
      items: asPlayer,
    },
    suggestionsAsAuthor: {
      count: asAuthor?.length ?? 0,
      error: e2?.message,
      items: asAuthor,
    },
    relationships: {
      count: rels?.length ?? 0,
      error: e3?.message,
      items: rels,
    },
  });
}
