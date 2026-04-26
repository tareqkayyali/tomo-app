import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/prompt-logs/:requestId
// Returns the full log entry including the blocks JSONB (rendered prompt sections).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { requestId } = await params;

  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("prompt_render_log")
    .select("*")
    .eq("request_id", requestId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[prompt-logs/:id] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
