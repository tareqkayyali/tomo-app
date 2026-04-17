/**
 * Shared-secret auth for cron-triggered API routes.
 *
 * Production pattern: Railway (or another scheduler) POSTs to the endpoint
 * with an `X-Cron-Secret` header matching the CRON_SECRET env var. The check
 * is constant-time to avoid timing side-channels.
 *
 * If CRON_SECRET is not set, the endpoint rejects all requests — fail-safe.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function requireCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
