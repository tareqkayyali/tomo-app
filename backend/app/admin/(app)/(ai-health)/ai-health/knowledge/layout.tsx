"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Knowledge Hub — shared chrome for the RAG knowledge surfaces.
 *
 * Before consolidation these were three sibling sidebar entries
 * (Browse, Editor, Graph) with no shared context. This layout adds
 * one hub title + a tab strip, collapsing them into a single Knowledge
 * entry in the sidebar while preserving every URL.
 *
 * Deep links continue to work — the editor tab accepts ?id=<uuid> to
 * load a specific chunk for editing from the Browse tab.
 */

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/ai-health/knowledge",
    label: "Browse",
    hint: "Table view + filters",
  },
  {
    href: "/admin/ai-health/knowledge/editor",
    label: "Editor",
    hint: "Rich-text edit + citations + auto-embed",
  },
  {
    href: "/admin/ai-health/knowledge/graph",
    label: "Graph",
    hint: "Entity + relationship visualization",
  },
];

export default function KnowledgeHubLayout({
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
            RAG Knowledge
          </h1>
          <p className="text-sm text-muted-foreground">
            Sports-science knowledge chunks consumed by the AI chat agent —
            browse, author with evidence citations, and visualize the
            entity graph.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/ai-health/knowledge"
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
