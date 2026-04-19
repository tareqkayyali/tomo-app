"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Observability Hub — shared chrome for the four monitoring surfaces:
 * Claude cost dashboard, AI service health feed, raw error/request
 * debug console, and the per-athlete ACWR workload inspector.
 *
 * Each surface keeps its own URL (the Next.js (monitoring) route group
 * is URL-transparent). The sidebar now shows a single "Observability"
 * entry; tabs navigate between the four lenses.
 */

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/observability",
    label: "Cost",
    hint: "Claude API spend, calls, tokens — daily_api_costs",
  },
  {
    href: "/admin/ai-health",
    label: "AI Health",
    hint: "Issues, fixes, insights, weekly trends",
  },
  {
    href: "/admin/debug",
    label: "Debug",
    hint: "Raw error + request logs (super_admin only)",
  },
  {
    href: "/admin/acwr-inspector",
    label: "ACWR",
    hint: "Per-athlete acute:chronic workload lookup",
  },
];

export default function MonitoringHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Observability
          </h1>
          <p className="text-sm text-muted-foreground">
            API cost, AI service health, raw debug logs, and per-athlete
            workload diagnostics — one surface.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
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
