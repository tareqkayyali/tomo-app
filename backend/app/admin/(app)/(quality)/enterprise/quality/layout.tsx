"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Chat Quality Hub — shared chrome for the 6 quality surfaces.
 *
 * Before Phase 3 these were separate sidebar entries (Overview, Safety Flags,
 * Disagreements, Drift, Shadow Runs, Golden Set) sharing the same data surface
 * but no nav. This layout adds a single Hub title + tab strip above the child
 * pages, so operators see one surface with six tabs instead of six entries.
 *
 * URLs are preserved — every tab deep-links to its existing route, so
 * bookmarks and sidebar entries keep working.
 */

const TABS: { href: string; label: string }[] = [
  { href: "/admin/enterprise/quality", label: "Overview" },
  { href: "/admin/enterprise/quality/safety-flags", label: "Safety Flags" },
  { href: "/admin/enterprise/quality/disagreements", label: "Judge Disagreements" },
  { href: "/admin/enterprise/quality/drift", label: "Drift Alerts" },
  { href: "/admin/enterprise/quality/shadow-runs", label: "Shadow Runs" },
  { href: "/admin/enterprise/quality/golden-set", label: "Golden Test Set" },
];

export default function ChatQualityHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chat Quality</h1>
          <p className="text-sm text-muted-foreground">
            Eval scores, safety flag triage, judge disagreements, drift alerts,
            shadow-run comparisons, and the golden test set — one surface.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/enterprise/quality"
                  ? pathname === tab.href
                  : pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <div>{children}</div>
    </div>
  );
}
