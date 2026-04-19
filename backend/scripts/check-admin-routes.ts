#!/usr/bin/env npx tsx
/**
 * check-admin-routes — sidebar href integrity scan.
 *
 * Every entry in EnterpriseSidebar.tsx's navigation array must resolve
 * to a live `page.tsx` under app/admin/. Runs as a CI step so that
 * ghost links (the CV / design / dna-card variety we deleted in Phase
 * 1a) can never silently creep back in.
 *
 * Exit code 0 on success, 1 on any missing route.
 *
 * Usage:
 *   npm run check:admin-routes
 */

import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const BACKEND_DIR = resolve(__dirname, "..");
const SIDEBAR = join(
  BACKEND_DIR,
  "components/admin/EnterpriseSidebar.tsx"
);
const ADMIN_APP_DIR = join(BACKEND_DIR, "app/admin");

function extractHrefs(src: string): string[] {
  // Match every `href: "/admin/..."` literal inside the navigation array.
  const rx = /href:\s*"(\/admin\/[^"]*)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src))) {
    out.push(m[1]);
  }
  return Array.from(new Set(out));
}

/**
 * Convert a URL like `/admin/enterprise/knowledge/editor` into the
 * possible on-disk page paths. The admin uses Next.js route groups —
 * `(app)`, `(content)`, etc — which are URL-transparent. So the page
 * file could live under any combination of route-group directories.
 *
 * Rather than walk every possible combination, we trust Next.js's
 * convention: the URL segments after `/admin/` become directory names
 * (no parens), plus a `page.tsx` leaf. We glob every `page.tsx` in the
 * admin tree and strip route-group segments to derive the served URL,
 * then check whether the target URL appears in that set.
 */
function buildUrlSet(): Set<string> {
  const urls = new Set<string>();
  const { execSync } = require("node:child_process") as typeof import("node:child_process");

  const out = execSync(
    `find "${ADMIN_APP_DIR}" -type f -name page.tsx`,
    { encoding: "utf-8" }
  );
  const pages = out.split("\n").filter(Boolean);

  for (const file of pages) {
    // Strip backend/app prefix → "/admin/..."
    let url = file.replace(BACKEND_DIR, "").replace("/app", "");
    // Remove trailing /page.tsx
    url = url.replace(/\/page\.tsx$/, "");
    // Remove route groups "(name)"
    url = url.replace(/\/\([^)]+\)/g, "");
    // Dynamic segments [id] stay — we treat any [*] as a wildcard match.
    if (url === "") url = "/";
    urls.add(url);
  }
  return urls;
}

function matches(href: string, urls: Set<string>): boolean {
  if (urls.has(href)) return true;
  // Also accept dynamic-segment equivalents: if any URL is `/admin/foo/[id]`
  // and the sidebar href is `/admin/foo/<uuid>`, treat it as a match.
  for (const u of urls) {
    const pattern = new RegExp(
      "^" + u.replace(/\[[^\]]+\]/g, "[^/]+") + "$"
    );
    if (pattern.test(href)) return true;
  }
  return false;
}

function main() {
  try {
    statSync(SIDEBAR);
  } catch {
    console.error(`[check-admin-routes] Cannot find sidebar file: ${SIDEBAR}`);
    process.exit(1);
  }

  const sidebarSrc = readFileSync(SIDEBAR, "utf-8");
  const hrefs = extractHrefs(sidebarSrc);
  const urls = buildUrlSet();

  const missing: string[] = [];
  for (const href of hrefs) {
    if (!matches(href, urls)) missing.push(href);
  }

  console.log(
    `[check-admin-routes] Scanned ${hrefs.length} sidebar hrefs against ${urls.size} page.tsx files.`
  );

  if (missing.length === 0) {
    console.log(`[check-admin-routes] OK — every sidebar link resolves.`);
    process.exit(0);
  }

  console.error(`[check-admin-routes] FAIL — ${missing.length} ghost link(s):`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error(
    `\nHint: either create the page.tsx at one of the URL's directories, or remove the entry from EnterpriseSidebar.tsx.`
  );
  process.exit(1);
}

main();
