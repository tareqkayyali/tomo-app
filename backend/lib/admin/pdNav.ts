/**
 * PD CMS navigation helpers.
 *
 * Shared by every page under /admin/pd/instructions. Two responsibilities:
 *   1. KNOWN_FROM — closed set of "from" slugs that the back chip recognises.
 *      Closed set is intentional: prevents arbitrary path injection through
 *      the ?from= query param.
 *   2. withFrom — appends ?from=<slug> to a relative href, preserving any
 *      pre-existing query string.
 */

export interface FromTarget {
  label: string;
  href: string;
}

export const KNOWN_FROM: Record<string, FromTarget> = {
  conflicts: { label: "Conflicts", href: "/admin/pd/instructions/conflicts" },
  snapshots: { label: "Snapshots", href: "/admin/pd/instructions/snapshots" },
  library: { label: "Methodology Library", href: "/admin/pd/instructions/library" },
  rules: { label: "Rules", href: "/admin/pd/instructions/directives" },
  // Preview is special: there's no canonical preview page — the back chip
  // falls back to history.back() because the snapshot id is part of the URL
  // and isn't carried through. The chip component handles this case.
  preview: { label: "Dry-run preview", href: "" },
};

/**
 * Append ?from=<slug> to an internal href. Preserves any existing query.
 *
 *   withFrom("/admin/pd/instructions/directives/abc", "conflicts")
 *     → "/admin/pd/instructions/directives/abc?from=conflicts"
 *
 *   withFrom("/foo?bar=baz", "rules")
 *     → "/foo?bar=baz&from=rules"
 */
export function withFrom(href: string, from: string): string {
  if (!from) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=${encodeURIComponent(from)}`;
}

/** Resolve a from-slug to a back target. Returns null for unknown slugs. */
export function resolveFrom(from: string | null | undefined): FromTarget | null {
  if (!from) return null;
  return KNOWN_FROM[from] ?? null;
}
