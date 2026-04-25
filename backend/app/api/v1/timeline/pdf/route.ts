/**
 * POST /api/v1/timeline/pdf
 *
 * Mints a fresh timeline_share_token for the requested range + event-type
 * set, then renders the public /t-timeline/<token> page to PDF via the
 * same Browserless pipeline used by /api/v1/cv/pdf.
 *
 * Request body:
 *   {
 *     fromDate: "YYYY-MM-DD",
 *     toDate:   "YYYY-MM-DD",
 *     eventTypes: ["training","match","recovery","study_block","exam","other"],
 *     tz: "Europe/Amman"
 *   }
 *
 * Returns 200 PDF bytes, or 501 + X-Fallback-URL if Browserless errors —
 * mirrors the cv/pdf contract so the mobile downloadPdf helper can reuse
 * its fallback logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { mintTimelineToken } from "@/lib/timelineToken";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  fromDate?: string;
  toDate?: string;
  eventTypes?: string[];
  tz?: string;
}

const VALID_TYPES = new Set([
  "training","match","recovery","study_block","exam","other",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fromDate = body.fromDate;
  const toDate = body.toDate;
  const tz = body.tz || "UTC";
  const eventTypes = Array.isArray(body.eventTypes)
    ? body.eventTypes.filter((t) => VALID_TYPES.has(t))
    : [];

  if (!fromDate || !DATE_RE.test(fromDate) || !toDate || !DATE_RE.test(toDate)) {
    return NextResponse.json(
      { error: "fromDate and toDate must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (fromDate > toDate) {
    return NextResponse.json(
      { error: "fromDate must be on or before toDate" },
      { status: 400 }
    );
  }
  if (eventTypes.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one event type" },
      { status: 400 }
    );
  }

  const token = await mintTimelineToken({
    userId: auth.user.id,
    fromDate,
    toDate,
    eventTypes,
  });

  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    req.headers.get("origin") ??
    `http://${req.headers.get("host") ?? "localhost:3000"}`;
  const url = `${origin}/t-timeline/${token}?print=1&tz=${encodeURIComponent(tz)}&_=${Date.now()}`;

  let pdfBuffer: Buffer | null = null;
  let renderError: string | null = null;
  try {
    pdfBuffer = await renderPdfWithBrowserless(url);
  } catch (err) {
    renderError = err instanceof Error ? err.message : String(err);
  }

  if (!pdfBuffer) {
    return NextResponse.json(
      {
        error: "PDF renderer not available",
        detail: renderError,
        printable_url: url,
      },
      { status: 501, headers: { "X-Fallback-URL": url } }
    );
  }

  // Best-effort athlete name for the filename.
  let athleteName = "player";
  const { data: user } = await (supabaseAdmin() as any)
    .from("users")
    .select("name")
    .eq("id", auth.user.id)
    .single();
  if (user?.name) athleteName = user.name as string;

  const safeName = athleteName.replace(/[^a-zA-Z0-9-]+/g, "_").toLowerCase();
  const fileLabel = `tomo-timeline-${safeName}-${fromDate}_${toDate}.pdf`;
  const uint8 = new Uint8Array(pdfBuffer);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileLabel}"`,
      "Cache-Control": "private, no-store",
      "X-Timeline-Token": token,
    },
  });
}

async function renderPdfWithBrowserless(url: string): Promise<Buffer> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    throw new Error("BROWSERLESS_TOKEN env var is not set");
  }

  const base = process.env.BROWSERLESS_URL ?? "https://chrome.browserless.io";
  const endpoint = `${base}/pdf?token=${encodeURIComponent(token)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      options: {
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      },
      gotoOptions: { waitUntil: "networkidle0", timeout: 20_000 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Browserless ${res.status}: ${detail.slice(0, 200)}`);
  }

  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
