/**
 * GET /api/v1/cv/pdf
 *
 * Renders the athlete's public CV to PDF using headless Chromium.
 * The PDF is a byte-for-byte match of what shows at /t/<slug>?print=1 so
 * design stays in sync across mobile, public web, and PDF.
 *
 * Auth:
 *   - Authenticated athlete: renders own CV (generates slug on the fly if
 *     not yet published).
 *   - ?slug=<slug> as query: renders any published CV anonymously (used
 *     by Save-to-Files on the scout view).
 *
 * Deployment note:
 *   Requires `playwright-core` + `@sparticuz/chromium` in backend/package.json.
 *   On Railway the @sparticuz binary is ~50MB and self-contained — no
 *   additional buildpack config needed. If the deps aren't installed,
 *   this route returns 501 with a link to the printable HTML view as
 *   a graceful degradation.
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
  const url = `${origin}/t/${slug}?print=1`;

  // Attempt the Playwright render. If the dep isn't installed or fails,
  // fall back to 501 + a Location header to the printable HTML view.
  let pdfBuffer: Buffer | null = null;
  let renderError: string | null = null;
  try {
    pdfBuffer = await renderPdfWithPlaywright(url);
  } catch (err) {
    renderError = err instanceof Error ? err.message : String(err);
  }

  if (!pdfBuffer) {
    return NextResponse.json(
      {
        error: "PDF renderer not available on this deploy",
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

async function renderPdfWithPlaywright(url: string): Promise<Buffer> {
  // Dynamic imports so the route still loads on deploys that haven't
  // installed the Playwright deps yet — in that case we throw here and
  // the outer try/catch returns 501 with a helpful fallback.
  const pw = await import("playwright-core" as any).catch(() => null);
  const sparticuz = await import("@sparticuz/chromium" as any).catch(() => null);

  if (!pw || !sparticuz) {
    throw new Error("playwright-core + @sparticuz/chromium not installed");
  }

  const chromium = pw.chromium;
  const executablePath = await sparticuz.default.executablePath();
  const browser = await chromium.launch({
    args: sparticuz.default.args,
    executablePath,
    headless: true,
  });

  try {
    // 794 × 1123 = exact A4 at 96 dpi. deviceScaleFactor 1 keeps CSS px values
    // consistent with print layout so the two-page structure renders correctly.
    const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.waitForTimeout(400);

    const pdf = await page.pdf({
      format: "A4",
      // Margins are controlled entirely via @page CSS so Playwright doesn't
      // add a second margin layer on top of the CSS margin box.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });

    return pdf;
  } finally {
    await browser.close();
  }
}
