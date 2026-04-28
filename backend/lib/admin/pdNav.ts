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
 * Append ?from=<slug> to an internal href. Optionally append &trail=<prevSlug>
 * so the back-chip on the destination page can preserve one extra hop of
 * context (e.g. snapshots → conflicts → rule edit → back to conflicts → back
 * to snapshots). One hop is enough for current PD flows; if we need deeper
 * stacks later, switch trail to a comma-list.
 *
 *   withFrom("/foo", "conflicts")
 *     → "/foo?from=conflicts"
 *   withFrom("/foo", "conflicts", "snapshots")
 *     → "/foo?from=conflicts&trail=snapshots"
 *   withFrom("/foo?x=1", "rules")
 *     → "/foo?x=1&from=rules"
 */
export function withFrom(
  href: string,
  from: string,
  trail?: string | null,
): string {
  if (!from) return href;
  const sep = href.includes("?") ? "&" : "?";
  const trailParam = trail ? `&trail=${encodeURIComponent(trail)}` : "";
  return `${href}${sep}from=${encodeURIComponent(from)}${trailParam}`;
}

/** Resolve a from-slug to a back target. Returns null for unknown slugs. */
export function resolveFrom(from: string | null | undefined): FromTarget | null {
  if (!from) return null;
  return KNOWN_FROM[from] ?? null;
}
