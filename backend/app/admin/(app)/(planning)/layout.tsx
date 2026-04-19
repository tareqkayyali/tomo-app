"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Planning Intelligence Hub — tab strip for the four planning-config
 * surfaces: Planning Protocols, Cognitive Windows, Scheduling Rules,
 * Dual Load Thresholds.
 *
 * Scoped by pathname: the PD Protocols subtree (/admin/enterprise/
 * protocols/*) has its own hub layout already, so we don't render the
 * outer tabs there — otherwise you'd see two horizontal tab bars.
 *
 * Planning-intelligence URLs are at unrelated paths (no common URL
 * prefix), so this layout applies per-request rather than per-URL-tree.
 */

const PLANNING_HUB_TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/planning-protocols",
    label: "Planning Protocols",
    hint: "Session planning rules (priority / phases / blocks)",
  },
  {
    href: "/admin/cognitive-windows",
    label: "Cognitive Windows",
    hint: "Time-of-day readiness windows and study-sport fit",
  },
  {
    href: "/admin/scheduling-rules",
    label: "Scheduling Rules",
    hint: "Training slot config + buffers + constraints",
  },
  {
    href: "/admin/dual-load",
    label: "Dual Load Thresholds",
    hint: "DLI zones and recommended actions",
  },
];

const HUB_PREFIXES = PLANNING_HUB_TABS.map((t) => t.href);

export default function PlanningHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Show the outer tab strip only when the current page is one of the
  // four planning-intelligence surfaces. Everything else in this route
  // group (currently just /admin/enterprise/protocols/*) renders without.
  const inPlanningHub = HUB_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!inPlanningHub) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Planning Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Tune the Tomo planning engine — protocol rules, cognitive
            windows, scheduling constraints, and dual-load advice.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {PLANNING_HUB_TABS.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + "/");
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
                    title={tab.hint}
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
