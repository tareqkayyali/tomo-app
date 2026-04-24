"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/data/programs",
    label: "Programs",
    hint: "Training programs and the position-based recommendation matrix",
  },
  {
    href: "/admin/data/drills",
    label: "Drills",
    hint: "Drill library — per-sport, per-attribute exercises",
  },
  {
    href: "/admin/data/normative-data",
    label: "Normative Data",
    hint: "Benchmark bands and SD wideners for athlete percentile scoring",
  },
  {
    href: "/admin/data/progress-metrics",
    label: "Progress Metrics",
    hint: "Custom metric definitions tracked over athlete development arcs",
  },
  {
    href: "/admin/data/dashboard-sections",
    label: "Dashboard Sections",
    hint: "Configurable sections shown on the athlete home dashboard",
  },
  {
    href: "/admin/data/content-items",
    label: "Content Items",
    hint: "Rich content library consumed by the recommendation engine",
  },
  {
    href: "/admin/data/notifications",
    label: "Notifications",
    hint: "Notification templates, scheduled jobs, and type config",
  },
  {
    href: "/admin/data/cv",
    label: "Athlete CV",
    hint: "CV reference verification and AI-generated profile summaries",
  },
];

export default function DataFabricHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-700">
            Data Fabric
          </h1>
          <p className="text-sm text-muted-foreground">
            The content and data layer — programs, drills, normative
            benchmarks, metrics, dashboard config, and athlete CV.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                pathname === tab.href ||
                pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-emerald-600 text-foreground"
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
