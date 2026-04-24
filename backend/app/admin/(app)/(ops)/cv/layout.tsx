"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/cv",
    label: "References",
    hint: "Identity-verification queue for submitted coach / scout references",
  },
  {
    href: "/admin/cv/summaries",
    label: "AI Summaries",
    hint: "Read-only ops view of per-athlete player-profile summaries",
  },
];

export default function AthleteCVHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Athlete CV</h1>
          <p className="text-sm text-muted-foreground">
            Reference identity verification and AI-generated player-profile
            summary oversight.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/cv"
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
