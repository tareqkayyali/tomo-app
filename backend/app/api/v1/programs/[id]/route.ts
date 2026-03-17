/**
 * GET /api/v1/programs/:id — Get a single training program by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const db = supabaseAdmin();

  const { data, error } = await (db as any)
    .from("football_training_programs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Program not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ program: data });
}
