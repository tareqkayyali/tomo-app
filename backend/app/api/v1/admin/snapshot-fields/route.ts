import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { RULE_BUILDER_FIELDS } from "@/services/programs/snapshotFieldRegistry";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json(RULE_BUILDER_FIELDS);
}
