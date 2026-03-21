import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RequestUser } from "@/lib/auth";

/**
 * Require admin access for API routes.
 * Checks the `is_admin` boolean column so users keep their normal role.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ user: RequestUser } | { error: NextResponse }> {
  const auth = requireAuth(req);
  if ("error" in auth) return auth;

  const db = supabaseAdmin();
  const { data } = await db
    .from("users")
    .select("is_admin")
    .eq("id", auth.user.id)
    .single() as { data: { is_admin: boolean } | null; error: unknown };

  if (!data || !data.is_admin) {
    return {
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    };
  }

  return { user: auth.user };
}
