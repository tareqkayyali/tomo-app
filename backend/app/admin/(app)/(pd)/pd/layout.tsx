"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PLANNING_TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/pd/planning",
    label: "Planning Protocols",
    hint: "Session planning rules (priority / phases / blocks)",
  },
  {
    href: "/admin/pd/cognitive-windows",
    label: "Cognitive Windows",
    hint: "Time-of-day readiness windows and study-sport fit",
  },
  {
    href: "/admin/pd/scheduling",
    label: "Scheduling Rules",
    hint: "Training slot config + buffers + constraints",
  },
  {
    href: "/admin/pd/dual-load",
    label: "Dual Load",
    hint: "DLI zones and recommended actions",
  },
];

const PLANNING_PREFIXES = PLANNING_TABS.map((t) => t.href);

export default function PdHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const inPlanningHub = PLANNING_PREFIXES.some(
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
            Tune the planning engine — protocol rules, cognitive windows,
            scheduling constraints, and dual-load advice.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {PLANNING_TABS.map((tab) => {
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
