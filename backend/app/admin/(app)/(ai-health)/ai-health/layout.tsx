"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/ai-health",
    label: "Dashboard",
    hint: "AI system health overview — traces, agent status, issues and fixes",
  },
  {
    href: "/admin/ai-health/quality",
    label: "Quality & Evals",
    hint: "Safety flags, disagreements, drift, shadow runs, golden set, eval suite, runs, baselines",
  },
  {
    href: "/admin/ai-health/knowledge",
    label: "Knowledge",
    hint: "RAG knowledge base — browse, author, and visualize the entity graph",
  },
  {
    href: "/admin/ai-health/ai-ops",
    label: "AI Ops",
    hint: "Auto-heal config, post-merge watches, pattern management, cron heartbeats",
  },
  {
    href: "/admin/ai-health/audit",
    label: "Audit",
    hint: "Append-only log of every auto-heal state transition",
  },
  {
    href: "/admin/ai-health/observability",
    label: "Observability",
    hint: "Claude API spend, call volume, and latency breakdown",
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
