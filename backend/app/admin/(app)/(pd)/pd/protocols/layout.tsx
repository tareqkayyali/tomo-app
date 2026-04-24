"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * PD Protocols Hub — shared chrome for the Performance Director
 * protocol surfaces.
 *
 * Before consolidation there were four sibling sidebar entries
 * (Protocols / Builder / Inheritance / Simulator). They're specialized
 * lenses over the same cms_protocols data, so we collapse them into a
 * single sidebar entry with a tab strip.
 */

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/pd/protocols",
    label: "Overview",
    hint: "Browse resolved protocols across the tenant hierarchy",
  },
  {
    href: "/admin/pd/protocols/builder",
    label: "Builder",
    hint: "Construct conditional rules + prescriptions (expert tool)",
  },
  {
    href: "/admin/pd/protocols/inheritance",
    label: "Inheritance",
    hint: "Visualize how protocols cascade down tenant tiers",
  },
  {
    href: "/admin/pd/protocols/test",
    label: "Simulator",
    hint: "Dry-run protocols against sample athlete snapshots",
  },
];

export default function PdProtocolsHubLayout({
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
            PD Protocols
          </h1>
          <p className="text-sm text-muted-foreground">
            Performance Director institutional protocols — overview,
            builder, inheritance tree, and dry-run simulator.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/pd/protocols"
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
