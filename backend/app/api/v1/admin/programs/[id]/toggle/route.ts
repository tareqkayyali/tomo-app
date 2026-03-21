import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";

// Toggle is no longer supported — the table has no 'active' column
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json(
    { error: "Toggle not supported — programs table has no 'active' column" },
    { status: 400 }
  );
}
