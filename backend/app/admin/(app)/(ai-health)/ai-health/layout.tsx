"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/ai-health",
    label: "Dashboard",
    hint: "AI system health overview and status indicators",
  },
  {
    href: "/admin/ai-health/auto-heal",
    label: "Auto-Heal",
    hint: "Auto-heal loop — issue detection, fix proposals, approval queue",
  },
  {
    href: "/admin/ai-health/quality",
    label: "Quality",
    hint: "Chat quality engine — golden set, shadow runs, drift, safety flags",
  },
  {
    href: "/admin/ai-health/evaluations",
    label: "Evaluations",
    hint: "Eval suite results, run history, and regression baselines",
  },
  {
    href: "/admin/ai-health/knowledge",
    label: "Knowledge",
    hint: "RAG knowledge base — browse, author, and visualize the entity graph",
  },
  {
    href: "/admin/ai-health/ai-ops",
    label: "AI Ops",
    hint: "Prompt management, model routing, and cost monitoring",
  },
  {
    href: "/admin/ai-health/observability",
    label: "Observability",
    hint: "Structured logs, trace analysis, and anomaly alerts",
  },
];

export default function AIHealthHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-violet-700">
            AI Health Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Full-stack observability and self-healing for the AI coaching
            pipeline — quality, evaluations, knowledge, and operations.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/ai-health"
                  ? pathname === tab.href
                  : pathname === tab.href ||
                    pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-violet-600 text-foreground"
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
