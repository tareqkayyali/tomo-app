/**
 * GET /api/v1/cv/pdf
 *
 * Renders the athlete's public CV to PDF using a hosted headless
 * Chromium service (Browserless.io). Browserless loads the public CV
 * page at /t/<slug>?print=1 with full @page CSS support, so the PDF is
 * a byte-for-byte match of the print design.
 *
 * Why Browserless instead of in-process Playwright:
 *   We tried `playwright-core` + `@sparticuz/chromium`, but the
 *   Sparticuz binary is built for AWS Lambda (Amazon Linux 2) and does
 *   not run in Railway's Debian container — every render returned 501.
 *   Hosted Chromium removes infra deps entirely.
 *
 * Auth:
 *   - Authenticated athlete: renders own CV (generates slug on the fly
 *     if not yet published).
 *   - ?slug=<slug> as query: renders any published CV anonymously (used
 *     by Save-to-Files on the scout view).
 *
 * Required env:
 *   BROWSERLESS_TOKEN — API token from https://browserless.io
 *   BROWSERLESS_URL   — optional, defaults to chrome.browserless.io
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { publishCV } from "@/services/cv/cvService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// PDF rendering can take 3-10s — bump the default timeout.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const slugParam = req.nextUrl.searchParams.get("slug");

  let slug: string;
  let athleteName: string = "player";

  if (slugParam) {
    slug = slugParam;
  } else {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const { slug: generatedSlug } = await publishCV(auth.user.id);
    slug = generatedSlug;

    const { data: user } = await (supabaseAdmin() as any)
      .from("users")
      .select("name")
      .eq("id", auth.user.id)
      .single();
    athleteName = user?.name ?? "player";
  }

  // Resolve to the full public URL the renderer should load.
  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    req.headers.get("origin") ??
    `http://${req.headers.get("host") ?? "localhost:3000"}`;
  // Append a per-request token so Browserless's render cache (and any
  // CDN in front of /t/<slug>) cannot serve a stale snapshot of the page.
  const url = `${origin}/t/${slug}?print=1&_=${Date.now()}`;

  // Render via Browserless. If the token is missing or the service
  // errors, return 501 + the printable URL so the client can fall back
  // to opening the HTML view.
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

  const safeName = athleteName.replace(/[^a-zA-Z0-9-]+/g, "_").toLowerCase();
  const uint8 = new Uint8Array(pdfBuffer);

  // Mark the export on cv_profiles for the "last PDF export" audit row.
  // Cast to any: generated types haven't been regen'd for migration 094 yet.
  if (!slugParam) {
    (supabaseAdmin() as any)
      .from("cv_profiles")
      .update({ last_pdf_export_at: new Date().toISOString() })
      .eq("share_slug", slug)
      .then(() => {}, () => {});
  }

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tomo-cv-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function renderPdfWithBrowserless(url: string): Promise<Buffer> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    throw new Error("BROWSERLESS_TOKEN env var is not set");
  }

  // Default to Browserless v1 PDF endpoint. Override via BROWSERLESS_URL
  // if you provisioned a regional v2 endpoint (e.g. production-sfo).
  const base = process.env.BROWSERLESS_URL ?? "https://chrome.browserless.io";
  const endpoint = `${base}/pdf?token=${encodeURIComponent(token)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      // Browserless forwards `options` straight to Puppeteer's page.pdf().
      // @page CSS in public-cv.css controls the inner margin box; we set
      // Puppeteer margins to 0 so they don't stack.
      options: {
        format: "A4",
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
