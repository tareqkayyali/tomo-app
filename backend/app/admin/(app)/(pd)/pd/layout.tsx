"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Phase 6 retirement: the Performance Director surface is now the
// Instructions Command Center. Legacy tabs (Protocols, Intelligence,
// Planning, Config, Modes, Chat Pills, Wearables, ACWR) were retired
// in this phase. Their pages remain loadable for bookmarks, but they
// are no longer surfaced in navigation. New rule authoring happens
// exclusively through the Methodology Command Center.
const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/pd/instructions",
    label: "Instructions",
    hint: "Methodology Command Center — author rules and define how Tomo behaves.",
  },
];

export default function PDHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Detect a legacy URL (anything under /admin/pd/ that isn't /instructions)
  // so we can render a deprecation banner pointing the user to the new home.
  const onLegacyPage =
    pathname.startsWith("/admin/pd/") &&
    !pathname.startsWith("/admin/pd/instructions");

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-blue-700">
            Performance Director
          </h1>
          <p className="text-sm text-muted-foreground">
            Methodology-driven coaching rules — author, review, publish.
          </p>
        </div>

        {onLegacyPage && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              This page has been retired.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              The Performance Director surface is now the{" "}
              <Link
                href="/admin/pd/instructions"
                className="font-medium underline underline-offset-2"
              >
                Instructions Command Center
              </Link>
              . The page below still loads for reference but is no longer the
              way to author rules. Anything you need is now expressed as a
              methodology directive.
            </p>
          </div>
        )}

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
                        ? "border-blue-600 text-foreground"
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
