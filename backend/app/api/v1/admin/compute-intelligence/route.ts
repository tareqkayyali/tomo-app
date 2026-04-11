/**
 * POST /api/v1/admin/compute-intelligence
 *
 * Intelligence scoring (TIS, behavioral fingerprint, adaptation) has been
 * migrated to the Python AI service. This endpoint returns 503 until
 * the CMS rebuild (Phase 8) adds a Python-backed replacement.
 *
 * Phase 9 cleanup: TS intelligence modules archived to git branch archive/ts-ai-agents-pre-cleanup.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json(
    {
      error: "Intelligence scoring migrated to Python AI service",
      migration_note: "Use LangSmith eval suite for scoring. CMS Phase 8 will add enterprise replacement.",
    },
    { status: 503 }
  );
}
